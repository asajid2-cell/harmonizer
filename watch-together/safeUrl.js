"use strict";
// SSRF guard shared by proxy.js, resolver.js, manga.js.
// Strategy: a guarded DNS `lookup` for http/https.request rejects any connection
// whose host resolves to a private/loopback/link-local/metadata address — this
// covers the initial request AND every redirect hop AND DNS-rebinding, because
// the agent re-runs lookup for each connection. Plus helpers for the headless
// browser (which can't use `lookup`) and per-source host allowlisting.

const dns = require("dns");
const net = require("net");
const { URL } = require("url");

/** Is this resolved IP in a private / loopback / link-local / reserved range? */
function ipIsPrivate(ip) {
  if (!ip) return true;
  ip = String(ip).replace(/^::ffff:/i, ""); // IPv4-mapped IPv6
  if (net.isIPv4(ip)) {
    const o = ip.split(".").map(Number);
    if (o[0] === 0) return true;
    if (o[0] === 127) return true;                                  // loopback
    if (o[0] === 10) return true;                                   // private
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;      // private
    if (o[0] === 192 && o[1] === 168) return true;                 // private
    if (o[0] === 169 && o[1] === 254) return true;                 // link-local (+169.254.169.254 metadata)
    if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true;     // CGNAT
    if (o[0] >= 224) return true;                                   // multicast / reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    if (x === "::1" || x === "::") return true;                     // loopback / unspecified
    if (x.startsWith("fe80")) return true;                          // link-local
    if (x.startsWith("fc") || x.startsWith("fd")) return true;      // unique-local
    if (x.startsWith("ff")) return true;                            // multicast
    return false;
  }
  return true; // unparseable → unsafe
}

/**
 * Drop-in `lookup` for http/https.request options. Resolves the host and fails
 * the connection if ANY resolved address is private. Use as: request({ ..., lookup }).
 */
function safeLookup(hostname, options, callback) {
  if (typeof options === "function") { callback = options; options = {}; }
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = Array.isArray(addresses) ? addresses : [addresses];
    for (const a of list) {
      if (ipIsPrivate(a.address)) {
        return callback(new Error("blocked: host resolves to a private/loopback address"));
      }
    }
    if (options && options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

/** Promise that rejects if the hostname resolves to any private address (headless-browser/yt-dlp preflight). */
function assertPublicHost(hostname) {
  return new Promise((resolve, reject) => {
    dns.lookup(hostname, { all: true }, (err, addresses) => {
      if (err) return reject(new Error("DNS resolution failed"));
      const list = Array.isArray(addresses) ? addresses : [addresses];
      if (list.some((a) => ipIsPrivate(a.address))) return reject(new Error("blocked: private/loopback host"));
      resolve(true);
    });
  });
}

/** Sync: is the URL's hostname one of the allowed hosts (case-insensitive, www-stripped)? */
function hostAllowed(rawUrl, allowed) {
  let h;
  try { h = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, ""); } catch { return false; }
  return allowed.map((a) => String(a).toLowerCase().replace(/^www\./, "")).includes(h);
}

module.exports = { ipIsPrivate, safeLookup, assertPublicHost, hostAllowed };
