"use strict";

const https = require("https");
const dns = require("dns");
const crypto = require("crypto");

let safeFetch;
try {
  safeFetch = require("./ssrf").safeFetch;
} catch {
  safeFetch = fallbackSafeFetch;
}

const USER_AGENT = "watch-together-cdn-discovery/1.0";
const DEFAULT_TIMEOUT_MS = 7000;
const DEFAULT_MAX_BYTES = 512 * 1024;
const SAMPLE_MOVIE_ID = "550";
const SAMPLE_TV_ID = "1399";

const STATS = {
  github: { parsedFiles: [], skippedFiles: [], failures: [] },
  ct: { domains: [], failures: [] },
  liveJs: { fetched: [], failures: [] },
};

const GITHUB_REPOS = [
  { name: "cinepro-org/core", paths: ["src/providers"] },
  { name: "Inside4ndroid/TMDB-Embed-API", paths: [""] },
  { name: "AdvithGopinath/LetMeWatch", paths: [""] },
];

const FAMILY_DEFS = {
  vixsrc: {
    roots: ["vixsrc.to"],
    templates: [
      { category: "movie", template: (d) => `https://${d}/movie/\${id}`, idShape: "tmdb" },
      { category: "tv", template: (d) => `https://${d}/tv/\${id}/\${s}/\${e}`, idShape: "tmdb" },
    ],
  },
  vidlink: {
    roots: ["vidlink.pro"],
    templates: [
      { category: "movie", template: (d) => `https://${d}/movie/\${id}`, idShape: "tmdb" },
      { category: "tv", template: (d) => `https://${d}/tv/\${id}/\${s}/\${e}`, idShape: "tmdb" },
    ],
  },
  videasy: {
    roots: ["videasy.net", "videasy.to"],
    templates: [
      { category: "movie", template: (d) => `https://${d}/movie/\${id}`, idShape: "tmdb" },
      { category: "tv", template: (d) => `https://${d}/tv/\${id}/\${s}/\${e}`, idShape: "tmdb" },
    ],
  },
  moviesapi: {
    roots: ["moviesapi.to"],
    templates: [
      { category: "movie", template: (d) => `https://${d}/movie/\${id}`, idShape: "tmdb" },
    ],
  },
  "2embed": {
    roots: ["2embed.skin", "2embed.cc", "2embed.me"],
    templates: [
      { category: "movie", template: (d) => `https://${d}/movie/\${id}`, idShape: "tmdb" },
    ],
  },
  vidsrc: {
    roots: ["vidsrc.cc", "vidsrc.su", "vidsrc.me", "vidsrc.wtf", "vidsrc.to"],
    templates: [
      { category: "movie", template: vidsrcMovieTemplate, idShape: "tmdb" },
      { category: "tv", template: vidsrcTvTemplate, idShape: "tmdb" },
    ],
  },
  pstream: {
    roots: ["pstream.org"],
    templates: [
      { category: "movie", template: (d) => `https://${d}/embed/tmdb-movie-\${id}`, idShape: "tmdb" },
    ],
  },
  vidnest: {
    roots: ["vidnest.fun"],
    templates: [
      { category: "movie", template: (d) => `https://${d}/movie/\${id}`, idShape: "tmdb" },
      { category: "tv", template: (d) => `https://${d}/tv/\${id}/\${s}/\${e}`, idShape: "tmdb" },
      { category: "anime", template: (d) => `https://${d}/anime/\${id}/\${e}/sub`, idShape: "tmdb" },
    ],
  },
  cineby: {
    roots: ["cineby.at"],
    templates: [
      { category: "movie", template: (d) => `https://${d}/movie/\${id}`, idShape: "tmdb" },
      { category: "tv", template: (d) => `https://${d}/tv/\${id}/\${s}/\${e}`, idShape: "tmdb" },
    ],
  },
  multiembed: {
    roots: ["multiembed.mov"],
    templates: [
      { category: "movie", template: (d) => `https://${d}/?video_id=\${id}&tmdb=1`, idShape: "tmdb" },
    ],
  },
  vidfast: {
    roots: ["vidfast.pro"],
    templates: [
      { category: "movie", template: (d) => `https://${d}/movie/\${id}`, idShape: "tmdb" },
    ],
  },
  vidjoy: {
    roots: ["vidjoy.pro"],
    templates: [
      { category: "movie", template: (d) => `https://${d}/embed/movie/\${id}`, idShape: "tmdb" },
    ],
  },
};

const KNOWN_FAMILIES = Object.keys(FAMILY_DEFS);
const HOST_PREFIXES = new Set(["www", "player", "iframe", "embed", "api", "core", "server", "cdn"]);

function vidsrcMovieTemplate(domain) {
  if (/\.cc$/i.test(domain)) return `https://${domain}/v2/embed/movie/\${id}`;
  if (/\.wtf$/i.test(domain)) return `https://${domain}/embed/movie/\${id}`;
  return `https://${domain}/embed/movie/\${id}`;
}

function vidsrcTvTemplate(domain) {
  if (/\.cc$/i.test(domain)) return `https://${domain}/v2/embed/tv/\${id}/\${s}/\${e}`;
  if (/\.wtf$/i.test(domain)) return `https://${domain}/embed/tv/\${id}/\${s}/\${e}`;
  return `https://${domain}/embed/tv/\${id}/\${s}/\${e}`;
}

async function githubHarvest() {
  resetStats("github");
  const all = [];

  for (const repo of GITHUB_REPOS) {
    for (const startPath of repo.paths) {
      let files;
      try {
        files = await listGithubFiles(repo.name, startPath);
      } catch (err) {
        STATS.github.failures.push(`${repo.name}/${startPath || "."}: ${err.message}`);
        continue;
      }

      for (const file of files) {
        if (!isProviderFile(file.path)) {
          STATS.github.skippedFiles.push(`${repo.name}/${file.path}`);
          continue;
        }

        try {
          const body = await fetchText(file.download_url, { maxBytes: 768 * 1024 });
          const candidates = extractCandidatesFromText(body, `github:${repo.name}/${file.path}`);
          if (candidates.length > 0) {
            STATS.github.parsedFiles.push({
              repo: repo.name,
              path: file.path,
              count: candidates.length,
            });
            all.push(...candidates);
          }
        } catch (err) {
          STATS.github.failures.push(`${repo.name}/${file.path}: ${err.message}`);
        }
      }
    }
  }

  return dedupeCandidates(all);
}

async function ctEnumerate(families) {
  resetStats("ct");
  const selected = normalizeFamilies(families && families.length ? families : KNOWN_FAMILIES);
  const all = [];

  for (const family of selected) {
    const def = FAMILY_DEFS[family] || familyDefFromName(family);
    const domains = new Set();

    for (const query of ctQueriesForFamily(family, def)) {
      try {
        const rows = await fetchJson(`https://crt.sh/?q=${encodeURIComponent(query)}&output=json`, {
          timeoutMs: 6000,
          maxBytes: 1024 * 1024,
        });
        for (const row of Array.isArray(rows) ? rows : []) {
          for (const domain of domainsFromCertRow(row)) {
            if (domainMatchesFamily(domain, family, def)) domains.add(domain);
          }
        }
      } catch (err) {
        STATS.ct.failures.push(`${family} ${query}: ${err.message}`);
      }
    }

    for (const root of def.roots || []) domains.add(root);
    const live = await mapLimit([...domains].slice(0, 25), 6, async (domain) => {
      const ok = await resolveAndHomepageLooksLive(domain);
      if (ok) {
        STATS.ct.domains.push({ family, domain, status: ok.status });
        return domain;
      }
      return null;
    });

    for (const domain of live.filter(Boolean)) {
      all.push(...candidatesForKnownFamily(family, domain, `ct:${family}:${domain}`));
    }
  }

  return dedupeCandidates(all);
}

async function liveJsCrawl(promotedDomains) {
  resetStats("liveJs");
  const inputs = promotedDomains && promotedDomains.length ? promotedDomains : [
    "vixsrc.to",
    "vidlink.pro",
    "moviesapi.to",
    "player.videasy.net",
    "iframe.pstream.org",
    "vidnest.fun",
    "2embed.skin",
  ];
  const all = [];

  for (const input of inputs) {
    const starts = startUrlsForPromotedInput(input);
    const seenUrls = new Set();
    const jsUrls = new Set();

    for (const url of starts) {
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);

      let html = "";
      try {
        html = await fetchText(url, { timeoutMs: 6500, maxBytes: 768 * 1024, maxRedirects: 3 });
        STATS.liveJs.fetched.push(url);
      } catch (err) {
        STATS.liveJs.failures.push(`${url}: ${err.message}`);
        continue;
      }

      all.push(...extractCandidatesFromText(html, `live-html:${url}`));
      for (const linked of linkedJsUrls(html, url)) jsUrls.add(linked);
      for (const domain of referencedKnownDomains(html)) {
        const family = inferFamilyFromDomain(domain);
        all.push(...candidatesForKnownFamily(family, domain, `live-html-domain:${url}`));
      }
    }

    for (const jsUrl of [...jsUrls].slice(0, 12)) {
      if (seenUrls.has(jsUrl)) continue;
      seenUrls.add(jsUrl);
      try {
        const js = await fetchText(jsUrl, { timeoutMs: 6500, maxBytes: 1024 * 1024, maxRedirects: 3 });
        STATS.liveJs.fetched.push(jsUrl);
        all.push(...extractCandidatesFromText(js, `live-js:${jsUrl}`));
        for (const domain of referencedKnownDomains(js)) {
          const family = inferFamilyFromDomain(domain);
          all.push(...candidatesForKnownFamily(family, domain, `live-js-domain:${jsUrl}`));
        }
      } catch (err) {
        STATS.liveJs.failures.push(`${jsUrl}: ${err.message}`);
      }
    }
  }

  return dedupeCandidates(all);
}

function extractCandidatesFromText(raw, evidence) {
  const text = decodeSourceText(raw);
  const candidates = [];
  const seenFragments = new Set();

  for (const fragment of extractUrlLikeFragments(text)) {
    if (seenFragments.has(fragment)) continue;
    seenFragments.add(fragment);
    const candidate = candidateFromTemplate(fragment, evidence);
    if (candidate) candidates.push(candidate);
  }

  const domains = extractDomains(text).slice(0, 80);
  const paths = extractPathFragments(text).slice(0, 120);
  for (const domain of domains) {
    const family = inferFamilyFromDomain(domain);
    if (FAMILY_DEFS[family] && !/^(api|api\d+|core|server)\./i.test(domain)) {
      candidates.push(...candidatesForKnownFamily(family, domain, `${evidence}:known-domain`));
    }
  }
  for (const domain of domains) {
    for (const path of paths) {
      const combined = combineDomainAndPath(domain, path);
      if (!combined) continue;
      const candidate = candidateFromTemplate(combined, `${evidence}:combined`);
      if (candidate) candidates.push(candidate);
    }
  }

  return dedupeCandidates(candidates);
}

function candidateFromTemplate(input, evidence) {
  let template = normalizeTemplate(input);
  if (!template) return null;

  template = addMissingPlaceholders(template);
  template = normalizeTemplate(template);
  if (!template || hasBadPlaceholderSyntax(template) || !looksLikeEmbedTemplate(template) || isApiOnlyTemplate(template)) return null;

  let url;
  try {
    url = new URL(template.replace(/\$\{id\}/g, SAMPLE_MOVIE_ID).replace(/\$\{s\}/g, "1").replace(/\$\{e\}/g, "1"));
  } catch {
    return null;
  }

  const domain = url.hostname.toLowerCase();
  if (isBadDiscoveryHost(domain)) return null;

  const original = String(input).toLowerCase();
  const category = inferCategory(template);
  const family = inferFamilyFromDomain(domain, template);
  const idShape = /imdb|tt\d{5,}/i.test(original) ? "imdb" : "tmdb";

  return {
    modality: "video",
    category,
    family,
    domain,
    template,
    idShape,
    sourceShape: "embed",
    evidence: compactEvidence(evidence),
  };
}

function normalizeTemplate(input) {
  let s = String(input || "").trim();
  if (!s) return null;

  s = s
    .replace(/\\u002[fF]/g, "/")
    .replace(/\\x2[fF]/g, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/^['"`]+|['"`;,]+$/g, "");

  s = s.replace(/^http:\/\//i, "https://");
  const start = s.search(/https:\/\//i);
  if (start > 0) s = s.slice(start);
  if (!/^https:\/\//i.test(s)) return null;

  s = s.replace(/\$+\{([^}]+)\}/g, (_, name) => placeholderForName(name));
  s = s.replace(/\{([^}]+)\}/g, (_, name) => placeholderForName(name));
  s = s.replace(/:tmdb(?:Id|ID|_id)?\b/g, "${id}");
  s = s.replace(/:imdb(?:Id|ID|_id)?\b/g, "${id}");
  s = s.replace(/:id\b/g, "${id}");
  s = s.replace(/:season\b|:seasonNumber\b|:s\b/g, "${s}");
  s = s.replace(/:episode\b|:episodeNumber\b|:e\b/g, "${e}");
  s = s.replace(/\[(?:tmdb|imdb|id|movieId|tmdbId)\]/gi, "${id}");
  s = s.replace(/\[(?:season|seasonNumber|s)\]/gi, "${s}");
  s = s.replace(/\[(?:episode|episodeNumber|e)\]/gi, "${e}");

  s = s.replace(/\/(movie|film)\/(?:550|27205|414906|tt\d{5,})(?=\/|\?|#|$)/i, "/$1/${id}");
  s = s.replace(/\/(tv|show|series)\/(?:1399|1396|60625|\d+)(?:\/(?:1|\d+))?(?:\/(?:1|\d+))?(?=\/|\?|#|$)/i, "/$1/${id}/${s}/${e}");
  s = s.replace(/tmdb-movie-(?:550|27205|414906|\d+)/i, "tmdb-movie-${id}");
  s = s.replace(/video_id=(?:550|27205|414906|\d+)/i, "video_id=${id}");
  s = s.replace(/id=(?:550|27205|414906|\d+)/i, "id=${id}");

  s = trimAtCodeJunk(s);
  return s;
}

function placeholderForName(name) {
  const n = String(name || "").toLowerCase();
  if (/season|\bse?\b|seasonnumber/.test(n)) return "${s}";
  if (/episode|\bep?\b|episodenumber/.test(n)) return "${e}";
  return "${id}";
}

function addMissingPlaceholders(template) {
  let s = template;
  if (/\$\{id\}/.test(s)) return s;

  if (/\/(?:movie|film)\/?($|[?#])/i.test(s)) {
    s = s.replace(/\/((?:movie|film))\/?($|[?#])/, "/$1/${id}$2");
  } else if (/\/(?:movie|film)$/i.test(s)) {
    s += "/${id}";
  } else if (/\/(?:tv|show|series)\/?($|[?#])/i.test(s)) {
    s = s.replace(/\/((?:tv|show|series))\/?($|[?#])/, "/$1/${id}/${s}/${e}$2");
  } else if (/\/(?:tv|show|series)$/i.test(s)) {
    s += "/${id}/${s}/${e}";
  } else if (/\/embed\/?$/i.test(s)) {
    s += "movie/${id}";
  }

  return s;
}

function trimAtCodeJunk(s) {
  const stops = [" + ", "'+", '"+', "`+", "`${", "<", ">", "\\n", "\\r"];
  let end = s.length;
  for (const stop of stops) {
    const idx = s.indexOf(stop);
    if (idx >= 0) end = Math.min(end, idx);
  }
  return s.slice(0, end).replace(/[)\]}.,;]+$/g, "");
}

function looksLikeEmbedTemplate(template) {
  if (!/\$\{id\}/.test(template)) return false;
  if (!/^https:\/\//i.test(template)) return false;
  const lower = template.toLowerCase();
  if (!/(movie|film|tv|show|series|anime|embed|tmdb|imdb|video_id|season|episode)/.test(lower)) return false;
  return true;
}

function hasBadPlaceholderSyntax(template) {
  if (/\$\$/.test(template)) return true;
  if (/\$\{[^}]*$/.test(template)) return true;
  const opens = (template.match(/\$\{/g) || []).length;
  const closes = (template.match(/\}/g) || []).length;
  return closes < opens;
}

function isApiOnlyTemplate(template) {
  let url;
  try {
    url = new URL(template.replace(/\$\{id\}/g, SAMPLE_MOVIE_ID).replace(/\$\{s\}/g, "1").replace(/\$\{e\}/g, "1"));
  } catch {
    return true;
  }

  const path = url.pathname.toLowerCase();
  const host = url.hostname.toLowerCase();
  if (/api\.themoviedb\.org|api\.trakt\.tv|omdbapi\.com|githubusercontent\.com/.test(host)) return true;
  if (/\/api\/?/.test(path) && !/embed|player|iframe/.test(path)) return true;
  if (/\/(graphql|search|sources?|servers?|episodes?)\/?$/.test(path)) return true;
  if (/\.(m3u8|mp4|json)(?:$|\?)/i.test(path)) return true;
  return false;
}

function inferCategory(template) {
  const lower = template.toLowerCase();
  if (/anime|anilist|ani\//.test(lower)) return "anime";
  if (/\/(tv|show|series)\b|season|episode|\$\{s\}|\$\{e\}/.test(lower)) return "tv";
  return "movie";
}

function inferFamilyFromDomain(domain, template) {
  const haystack = `${domain || ""} ${template || ""}`.toLowerCase();
  for (const family of KNOWN_FAMILIES) {
    if (haystack.includes(family)) return family;
  }

  const parts = String(domain || "").toLowerCase().replace(/^www\./, "").split(".");
  while (parts.length > 2 && HOST_PREFIXES.has(parts[0])) parts.shift();
  return parts.length >= 2 ? parts[parts.length - 2] : (parts[0] || "unknown");
}

function extractUrlLikeFragments(text) {
  const out = [];
  const re = /https?:\\?\/\\?\/[^"'`\s<>()]+/gi;
  let match;
  while ((match = re.exec(text))) {
    out.push(match[0]);
  }
  return out;
}

function extractDomains(text) {
  const out = new Set();
  const re = /https?:\\?\/\\?\/([a-z0-9*_.-]+\.[a-z]{2,})/gi;
  let match;
  while ((match = re.exec(text))) {
    const domain = match[1].replace(/^\*\./, "").toLowerCase();
    if (!isBadDiscoveryHost(domain)) out.add(domain);
  }
  return [...out];
}

function extractPathFragments(text) {
  const out = new Set();
  const stringRe = /["'`]([^"'`]{2,260})["'`]/g;
  let match;
  while ((match = stringRe.exec(text))) {
    const s = decodeSourceText(match[1]).trim();
    if (!s.startsWith("/")) continue;
    if (!/(movie|film|tv|show|series|anime|embed|tmdb|imdb)/i.test(s)) continue;
    out.add(s);
  }
  return [...out];
}

function combineDomainAndPath(domain, path) {
  if (!domain || !path || path.startsWith("//")) return null;
  if (!path.startsWith("/")) path = `/${path}`;
  return `https://${domain}${path}`;
}

function decodeSourceText(raw) {
  return String(raw || "")
    .replace(/\\u002[fF]/g, "/")
    .replace(/\\x2[fF]/g, "/")
    .replace(/\\\//g, "/")
    .replace(/\\\\/g, "\\");
}

function isBadDiscoveryHost(domain) {
  if (!domain) return true;
  if (/localhost|127\.|0\.0\.0\.0|\.local$|\.internal$/.test(domain)) return true;
  if (/(github|google|gstatic|cloudflare|sentry|vercel|netlify|npmjs|schema\.org|w3\.org|example\.com)$/.test(domain)) return true;
  return false;
}

function candidatesForKnownFamily(family, domain, evidence) {
  const def = FAMILY_DEFS[family];
  if (!def || !domain) return [];
  return def.templates.map((item) => ({
    modality: "video",
    category: item.category,
    family,
    domain: domain.toLowerCase(),
    template: item.template(domain.toLowerCase()),
    idShape: item.idShape,
    sourceShape: "embed",
    evidence: compactEvidence(evidence),
  }));
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const out = [];
  for (const c of candidates) {
    if (!c || !c.family || !c.template) continue;
    const key = `${c.family}|${c.template}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function compactEvidence(evidence) {
  const s = String(evidence || "unknown");
  if (s.length <= 180) return s;
  const hash = crypto.createHash("sha1").update(s).digest("hex").slice(0, 10);
  return `${s.slice(0, 150)}#${hash}`;
}

async function listGithubFiles(repo, startPath) {
  try {
    return await listGithubFilesByTree(repo, startPath);
  } catch {
    return listGithubFilesByContents(repo, startPath);
  }
}

async function listGithubFilesByTree(repo, startPath) {
  const root = String(startPath || "").replace(/^\/+|\/+$/g, "");
  const tree = await fetchJson(`https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`, {
    headers: githubHeaders(),
    timeoutMs: 8000,
    maxBytes: 2 * 1024 * 1024,
  });
  const rows = Array.isArray(tree.tree) ? tree.tree : [];
  return rows
    .filter((item) => item.type === "blob")
    .filter((item) => !root || item.path === root || item.path.startsWith(`${root}/`))
    .filter((item) => isProviderFile(item.path))
    .slice(0, 240)
    .map((item) => ({
      path: item.path,
      download_url: `https://raw.githubusercontent.com/${repo}/HEAD/${item.path}`,
      size: item.size || 0,
    }));
}

async function listGithubFilesByContents(repo, startPath) {
  const out = [];
  const queue = [startPath || ""];
  const seen = new Set();

  while (queue.length && out.length < 160) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);

    const apiPath = path ? `/repos/${repo}/contents/${encodeURIComponentPath(path)}` : `/repos/${repo}/contents`;
    const items = await fetchJson(`https://api.github.com${apiPath}`, {
      headers: githubHeaders(),
      timeoutMs: 8000,
      maxBytes: 1024 * 1024,
    });
    const list = Array.isArray(items) ? items : [items];

    for (const item of list) {
      if (item.type === "dir" && shouldDescendGithubDir(item.path)) {
        queue.push(item.path);
      } else if (item.type === "file" && item.download_url) {
        out.push({ path: item.path, download_url: item.download_url, size: item.size || 0 });
      }
    }
  }

  return out;
}

function githubHeaders() {
  return {
    "user-agent": USER_AGENT,
    "accept": "application/vnd.github+json",
  };
}

function shouldDescendGithubDir(path) {
  const p = String(path || "").toLowerCase();
  if (/(^|\/)(node_modules|dist|build|coverage|public|static|assets|images?|docs?|test|tests|examples?)($|\/)/.test(p)) return false;
  return true;
}

function isProviderFile(path) {
  const p = String(path || "").toLowerCase();
  if (/(^|\/)(readme|license|package-lock|yarn.lock|pnpm-lock|tsconfig|vite.config|next.config)/.test(p)) return false;
  if (/(^|\/)(docs?|public|static|assets|images?|test|tests|examples?)\//.test(p)) return false;
  if (!/\.(js|jsx|ts|tsx|mjs|cjs|json|yml|yaml|txt|py)$/i.test(p)) return false;
  return /(provider|source|embed|movie|tmdb|vid|server|api|route|index|main|app)/i.test(p);
}

function encodeURIComponentPath(path) {
  return String(path || "").split("/").map(encodeURIComponent).join("/");
}

async function fetchJson(url, options) {
  const text = await fetchText(url, options);
  return JSON.parse(text);
}

async function fetchText(url, options) {
  const opts = options || {};
  const res = await safeFetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      "accept": opts.accept || "*/*",
      ...(opts.headers || {}),
    },
    timeoutMs: opts.timeoutMs || DEFAULT_TIMEOUT_MS,
    maxBytes: opts.maxBytes || DEFAULT_MAX_BYTES,
    maxRedirects: opts.maxRedirects == null ? 4 : opts.maxRedirects,
  });
  const status = Number(res.status || res.statusCode || 0);
  if (status < 200 || status >= 400) throw new Error(`HTTP ${status}`);
  return bodyToString(res.body);
}

function bodyToString(body) {
  if (Buffer.isBuffer(body)) return body.toString("utf8");
  if (body == null) return "";
  return String(body);
}

function normalizeFamilies(families) {
  const out = [];
  for (const item of families) {
    const family = inferFamilyFromDomain(String(item).replace(/^https?:\/\//, "").split("/")[0], item);
    out.push(FAMILY_DEFS[family] ? family : String(item).toLowerCase());
  }
  return [...new Set(out)];
}

function familyDefFromName(family) {
  return {
    roots: String(family || "").includes(".") ? [String(family).toLowerCase()] : [],
    templates: [
      { category: "movie", template: (d) => `https://${d}/movie/\${id}`, idShape: "tmdb" },
    ],
  };
}

function ctQueriesForFamily(family, def) {
  const out = new Set();
  for (const root of def.roots || []) {
    out.add(`%.${root}`);
    out.add(root);
  }
  if (!String(family).includes(".")) {
    out.add(`${family}.%`);
    out.add(`%.${family}.%`);
  }
  return [...out].slice(0, 3);
}

function domainsFromCertRow(row) {
  const out = [];
  for (const key of ["name_value", "common_name"]) {
    const raw = row && row[key];
    if (!raw) continue;
    for (let domain of String(raw).split(/\s+/)) {
      domain = domain.trim().toLowerCase().replace(/^\*\./, "");
      if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) out.push(domain);
    }
  }
  return out;
}

function domainMatchesFamily(domain, family, def) {
  const d = String(domain || "").toLowerCase();
  if (d.includes(String(family).toLowerCase())) return true;
  return (def.roots || []).some((root) => d === root || d.endsWith(`.${root}`));
}

async function resolveAndHomepageLooksLive(domain) {
  try {
    await assertPublicHostname(domain);
  } catch {
    return null;
  }

  try {
    const res = await safeFetch(`https://${domain}/`, {
      headers: { "user-agent": USER_AGENT, "accept": "text/html,*/*" },
      timeoutMs: 2200,
      maxBytes: 64 * 1024,
      maxRedirects: 2,
    });
    const status = Number(res.status || 0);
    const body = bodyToString(res.body).toLowerCase();
    if (status >= 200 && status < 500 && !looksParked(body)) return { status };
  } catch (err) {
    STATS.ct.failures.push(`${domain}: ${err.message}`);
  }
  return null;
}

function looksParked(body) {
  return /domain for sale|buy this domain|parked free|sedoparking|bodis|parkingcrew|afternic/.test(body || "");
}

function startUrlsForPromotedInput(input) {
  const raw = String(input || "").trim();
  if (!raw) return [];
  if (/^https:\/\//i.test(raw)) return [raw];

  const domain = raw.replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();
  const family = inferFamilyFromDomain(domain);
  const starts = new Set([`https://${domain}/`]);
  for (const candidate of candidatesForKnownFamily(family, domain, "seed")) {
    starts.add(materializeTemplate(candidate.template));
  }
  return [...starts];
}

function materializeTemplate(template) {
  return template
    .replace(/\$\{id\}/g, inferCategory(template) === "tv" ? SAMPLE_TV_ID : SAMPLE_MOVIE_ID)
    .replace(/\$\{s\}/g, "1")
    .replace(/\$\{e\}/g, "1");
}

function linkedJsUrls(html, baseUrl) {
  const out = new Set();
  const re = /(?:src|href)=["']([^"']+\.js(?:\?[^"']*)?)["']/gi;
  let match;
  while ((match = re.exec(html))) {
    try {
      const url = new URL(match[1], baseUrl);
      if (url.protocol === "https:" && !isBadDiscoveryHost(url.hostname)) out.add(url.toString());
    } catch {}
  }
  return [...out];
}

function referencedKnownDomains(text) {
  return extractDomains(text).filter((domain) => FAMILY_DEFS[inferFamilyFromDomain(domain)]);
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      try {
        out[idx] = await fn(items[idx], idx);
      } catch {
        out[idx] = null;
      }
    }
  });
  await Promise.all(workers);
  return out;
}

function resetStats(feed) {
  if (feed === "github") STATS.github = { parsedFiles: [], skippedFiles: [], failures: [] };
  if (feed === "ct") STATS.ct = { domains: [], failures: [] };
  if (feed === "liveJs") STATS.liveJs = { fetched: [], failures: [] };
}

function publicIpLooksBlocked(ip) {
  const s = String(ip || "").replace(/^::ffff:/i, "");
  const v4 = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const o = v4.slice(1).map(Number);
    if (o.some((n) => n < 0 || n > 255)) return true;
    if (o[0] === 0 || o[0] === 10 || o[0] === 127) return true;
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
    if (o[0] === 192 && o[1] === 168) return true;
    if (o[0] === 169 && o[1] === 254) return true;
    if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true;
    if (o[0] >= 224) return true;
    return false;
  }

  const v6 = s.toLowerCase();
  if (!v6.includes(":")) return true;
  if (v6 === "::1" || v6 === "::") return true;
  if (v6.startsWith("fe80") || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("ff")) return true;
  return false;
}

function assertPublicHostname(hostname) {
  return new Promise((resolve, reject) => {
    dns.lookup(hostname, { all: true }, (err, rows) => {
      if (err) return reject(err);
      const list = Array.isArray(rows) ? rows : [rows];
      if (!list.length) return reject(new Error("DNS returned no addresses"));
      if (list.some((row) => publicIpLooksBlocked(row.address))) return reject(new Error("blocked private/reserved address"));
      resolve(true);
    });
  });
}

function fallbackSafeFetch(rawUrl, options) {
  const opts = options || {};
  const maxRedirects = opts.maxRedirects == null ? 3 : opts.maxRedirects;
  return fallbackSafeFetchHop(rawUrl, opts, maxRedirects);
}

async function fallbackSafeFetchHop(rawUrl, opts, redirectsLeft) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("fallback safeFetch only allows https");
  await assertPublicHostname(url.hostname);

  const res = await new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: "GET",
      headers: opts.headers || {},
      timeout: opts.timeoutMs || DEFAULT_TIMEOUT_MS,
      lookup(hostname, lookupOpts, cb) {
        const wantsAll = Boolean(lookupOpts && lookupOpts.all);
        dns.lookup(hostname, { ...lookupOpts, all: true }, (err, rows) => {
          if (err) return cb(err);
          const list = Array.isArray(rows) ? rows : [rows];
          if (list.some((row) => publicIpLooksBlocked(row.address))) return cb(new Error("blocked private/reserved address"));
          if (wantsAll) return cb(null, list);
          const first = list[0];
          cb(null, first.address, first.family);
        });
      },
    }, (response) => {
      const chunks = [];
      let size = 0;
      const maxBytes = opts.maxBytes || DEFAULT_MAX_BYTES;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          req.destroy(new Error("maxBytes exceeded"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
        finalUrl: url.toString(),
      }));
    });
    req.setTimeout(opts.timeoutMs || DEFAULT_TIMEOUT_MS, () => req.destroy(new Error("timeout")));
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });

  if (res.status >= 300 && res.status < 400 && res.headers.location) {
    if (redirectsLeft <= 0) throw new Error("redirect limit exceeded");
    const next = new URL(res.headers.location, url).toString();
    return fallbackSafeFetchHop(next, opts, redirectsLeft - 1);
  }

  return res;
}

async function selfTest() {
  const gh = await githubHarvest();
  const ct = await ctEnumerate(["vidsrc", "vixsrc", "vidlink", "videasy", "moviesapi", "2embed", "pstream", "vidnest"]);
  const live = await liveJsCrawl(["vixsrc.to", "vidlink.pro", "moviesapi.to", "player.videasy.net", "iframe.pstream.org", "vidnest.fun", "2embed.skin"]);

  printFeed("githubHarvest", gh);
  console.log("github parsed files:", STATS.github.parsedFiles);
  if (STATS.github.failures.length) console.log("github failures:", STATS.github.failures.slice(0, 20));

  printFeed("ctEnumerate", ct);
  console.log("ct live domains:", STATS.ct.domains);
  if (STATS.ct.failures.length) console.log("ct failures:", STATS.ct.failures.slice(0, 30));

  printFeed("liveJsCrawl", live);
  console.log("live fetched:", STATS.liveJs.fetched);
  if (STATS.liveJs.failures.length) console.log("live failures:", STATS.liveJs.failures.slice(0, 30));
}

function printFeed(name, records) {
  console.log(`\n${name}: ${records.length} candidates`);
  console.log(JSON.stringify(records.slice(0, 3), null, 2));
}

module.exports = {
  githubHarvest,
  ctEnumerate,
  liveJsCrawl,
  _stats: STATS,
  _extractCandidatesFromText: extractCandidatesFromText,
};

if (require.main === module) {
  selfTest().catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  });
}
