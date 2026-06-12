"use strict";

const https = require("https");
const http  = require("http");
const { URL } = require("url");
const { safeLookup } = require("./safeUrl");

const STRIP_UPSTREAM = new Set([
  "access-control-allow-origin","access-control-allow-credentials",
  "access-control-allow-headers","access-control-allow-methods",
  "access-control-expose-headers","access-control-max-age",
  "x-frame-options","content-security-policy",
  "transfer-encoding","connection","keep-alive","set-cookie",
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Content-Type, Accept-Ranges",
};

const MAX_REDIRECTS = 5;

// In-memory LRU image cache — manga pages/covers are immutable, so cache them so re-reads,
// both partners on the same page, and re-scrolls are instant instead of re-fetching the CDN.
const imgCache = new Map();          // key -> { headers, body }
const IMG_CACHE_MAX = 500;           // ~ up to a few hundred MB depending on page sizes
const IMG_MAX_BYTES = 6 * 1024 * 1024;
function imgKey(url, ref) { return (ref || "") + "|" + url; }

function isHlsManifest(contentType, url) {
  const ct = (contentType || "").split(";")[0].trim().toLowerCase();
  if (ct === "application/x-mpegurl" || ct === "application/vnd.apple.mpegurl" ||
      ct === "audio/mpegurl" || ct === "application/dash+xml") return true;
  return /\.m3u8(\?|$)/i.test(url) || /\.mpd(\?|$)/i.test(url);
}

function rewriteManifest(body, manifestUrl, proxyBase) {
  let out = body.replace(/^(?!#)(\S.*)$/gm, (line) => {
    try { return proxyBase + encodeURIComponent(new URL(line.trim(), manifestUrl).href); }
    catch { return line; }
  });
  out = out.replace(/URI="([^"]+)"/g, (_match, uri) => {
    try { return `URI="${proxyBase}${encodeURIComponent(new URL(uri, manifestUrl).href)}"`; }
    catch { return _match; }
  });
  return out;
}

function doRequest(url, clientHeaders, redirectsLeft, res, proxyBase, customReferer, cacheKey) {
  let parsed;
  try { parsed = new URL(url); } catch {
    if (!res.headersSent) res.status(400).json({ error: "Invalid URL" });
    return;
  }

  const lib = parsed.protocol === "https:" ? https : http;

  const upHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Encoding": "identity",
  };
  if (customReferer) {
    upHeaders["Referer"] = customReferer;
    try { upHeaders["Origin"] = new URL(customReferer).origin; } catch {}
  }
  if (clientHeaders.range) upHeaders["Range"] = clientHeaders.range;

  const req = lib.request(
    { hostname: parsed.hostname, port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search, method: "GET", headers: upHeaders,
      lookup: safeLookup }, // SSRF guard: reject private/loopback targets at connect (incl. redirects)
    (upstream) => {
      const status = upstream.statusCode;

      if ([301, 302, 303, 307, 308].includes(status) && upstream.headers.location && redirectsLeft > 0) {
        upstream.resume();
        doRequest(new URL(upstream.headers.location, url).href, clientHeaders, redirectsLeft - 1, res, proxyBase, customReferer, cacheKey);
        return;
      }

      const outHeaders = Object.assign({}, CORS_HEADERS);
      for (const [k, v] of Object.entries(upstream.headers)) {
        if (!STRIP_UPSTREAM.has(k.toLowerCase())) outHeaders[k] = v;
      }

      const contentType = upstream.headers["content-type"] || "";

      if (isHlsManifest(contentType, url)) {
        const chunks = [];
        upstream.on("data", (c) => chunks.push(c));
        upstream.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const rewritten = rewriteManifest(text, url, proxyBase);
          const buf = Buffer.from(rewritten, "utf8");
          outHeaders["content-type"] = "application/x-mpegurl";
          outHeaders["content-length"] = String(buf.length);
          outHeaders["cache-control"] = "no-store, no-cache, must-revalidate";
          delete outHeaders["content-range"];
          delete outHeaders["cdn-cache-control"];
          res.writeHead(200, outHeaders);
          res.end(buf);
        });
        upstream.on("error", () => { if (!res.destroyed) res.destroy(); });
        return;
      }

      // Images: buffer + cache + mark cacheable so the browser caches them too (manga speed).
      const ct = contentType.split(";")[0].trim().toLowerCase();
      if (status === 200 && (ct.indexOf("image/") === 0 || ct === "application/octet-stream") && cacheKey) {
        const chunks = [];
        upstream.on("data", (c) => chunks.push(c));
        upstream.on("end", () => {
          const buf = Buffer.concat(chunks);
          outHeaders["cache-control"] = "public, max-age=604800, immutable";
          outHeaders["content-length"] = String(buf.length);
          delete outHeaders["content-range"];
          res.writeHead(200, outHeaders);
          res.end(buf);
          if (buf.length > 0 && buf.length < IMG_MAX_BYTES) {
            imgCache.set(cacheKey, { headers: Object.assign({}, outHeaders), body: buf });
            if (imgCache.size > IMG_CACHE_MAX) imgCache.delete(imgCache.keys().next().value);
          }
        });
        upstream.on("error", () => { if (!res.destroyed) res.destroy(); });
        return;
      }

      res.writeHead(status, outHeaders);
      upstream.pipe(res, { end: true });
      upstream.on("error", () => { if (!res.destroyed) res.destroy(); });
    }
  );

  req.on("error", (err) => {
    if (!res.headersSent) res.status(502).json({ error: "Upstream fetch failed", detail: err.message });
    else if (!res.destroyed) res.destroy();
  });

  req.setTimeout(20000, () => {
    req.destroy();
    if (!res.headersSent) res.status(504).json({ error: "Upstream timed out" });
  });

  req.end();
}

function mountProxy(app) {
  app.options("/api/proxy", (_req, res) => {
    res.set({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type",
      "Access-Control-Max-Age": "86400",
    }).sendStatus(204);
  });

  app.get("/api/proxy", (req, res) => {
    const raw = req.query.url;
    if (!raw) return res.status(400).json({ error: "Missing ?url= parameter" });

    let parsed;
    try { parsed = new URL(raw); } catch {
      return res.status(400).json({ error: "Malformed URL" });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return res.status(400).json({ error: "Only http/https URLs allowed" });
    }

    const customReferer = req.query.referer || null;
    const base = process.env.BASE_PATH || "";
    const refPart = customReferer ? "referer=" + encodeURIComponent(customReferer) + "&" : "";
    const proxyBase = `${req.protocol}://${req.get("host")}${base}/api/proxy?${refPart}url=`;

    // serve cached images instantly (no upstream round-trip)
    const ck = imgKey(raw, customReferer);
    const hit = imgCache.get(ck);
    if (hit && !req.headers.range) {
      imgCache.delete(ck); imgCache.set(ck, hit);   // LRU touch
      const h = Object.assign({}, hit.headers); h["x-wt-cache"] = "HIT";
      res.writeHead(200, h);
      return res.end(hit.body);
    }

    doRequest(raw, req.headers, MAX_REDIRECTS, res, proxyBase, customReferer, ck);
  });
}

module.exports = { mountProxy };
