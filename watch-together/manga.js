'use strict';
// Manga reading backend — multi-source adapters. Each source exposes:
//   search(q)        -> [{ source, id, title, poster }]
//   chapters(id)     -> [{ id, chap, title }]  (ascending by chapter)
//   pages(id)        -> { pages: [imgUrl...], referer }   (referer for the image proxy)
// Reading is image-based: the reader loads each page via /api/proxy?url=..&referer=..
const https = require('https');
const { safeLookup, hostAllowed } = require('./safeUrl');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// SSRF guard for fetches whose URL is (partly) client-controlled: the final host
// must belong to the expected source. Kills the mangapill `@host` injection and
// stops the per-source pages() endpoints from being used to fetch arbitrary hosts.
function mustHost(url, ...hosts) {
  if (!hostAllowed(url, hosts)) throw new Error('blocked: host not allowed for this source');
  return url;
}

function httpGet(url, headers, redirects) {
  redirects = redirects == null ? 5 : redirects;
  return new Promise((resolve, reject) => {
    let u; try { u = new URL(url); } catch (e) { return reject(e); }
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: Object.assign({ 'User-Agent': UA, 'Accept': '*/*' }, headers || {}),
      lookup: safeLookup, // reject private/loopback targets at connect (incl. redirects)
    }, (r) => {
      if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location && redirects > 0) {
        r.resume();
        return httpGet(new URL(r.headers.location, url).href, headers, redirects - 1).then(resolve, reject);
      }
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(chunks).toString('utf8'), finalUrl: url }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}
async function getJson(url, headers) { const r = await httpGet(url, headers); return JSON.parse(r.body); }
function dedupeChapters(list) {
  const seen = new Set(), out = [];
  for (const c of list) { const k = String(c.chap); if (!seen.has(k)) { seen.add(k); out.push(c); } }
  return out;
}
function numAsc(a, b) { return (parseFloat(a.chap) || 0) - (parseFloat(b.chap) || 0); }
function slugify(s) { return String(s).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

// ---------------- MangaDex (JSON, no referer) ----------------
const MD = 'https://api.mangadex.org';
const mangadex = {
  referer: '',
  async search(q) {
    const url = MD + '/manga?title=' + encodeURIComponent(q) + '&limit=12&order[relevance]=desc&includes[]=cover_art'
      + '&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica';
    const d = await getJson(url);
    return (d.data || []).map(m => {
      const t = (m.attributes.title.en) || Object.values(m.attributes.title || {})[0] || '(untitled)';
      const cov = (m.relationships || []).find(x => x.type === 'cover_art');
      const fn = cov && cov.attributes && cov.attributes.fileName;
      return { source: 'mangadex', id: m.id, title: t,
        poster: fn ? ('https://uploads.mangadex.org/covers/' + m.id + '/' + fn + '.256.jpg') : null };
    });
  },
  async chapters(id) {
    let all = [], off = 0;
    for (;;) {
      const url = MD + '/manga/' + id + '/feed?translatedLanguage[]=en&order[chapter]=asc&order[volume]=asc&limit=100&offset=' + off
        + '&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica';
      const d = await getJson(url);
      (d.data || []).forEach(c => { if ((c.attributes.pages || 0) > 0) all.push({ id: c.id, chap: c.attributes.chapter || '0', title: c.attributes.title || '' }); });
      off += 100;
      if (!d.data || d.data.length < 100 || off >= (d.total || 0) || off > 3000) break;
    }
    return dedupeChapters(all.sort(numAsc));
  },
  async pages(chapterId) {
    const d = await getJson(MD + '/at-home/server/' + chapterId);
    return { pages: d.chapter.data.map(fn => d.baseUrl + '/data/' + d.chapter.hash + '/' + fn), referer: '' };
  },
};

// ---------------- ComicK (comick.art JSON, referer required) ----------------
const CK = 'https://comick.art';
const CK_REF = 'https://comick.art/';
const comick = {
  referer: CK_REF,
  async search(q) {
    const d = await getJson(CK + '/api/search?q=' + encodeURIComponent(q) + '&limit=12', { Referer: CK_REF });
    const arr = Array.isArray(d) ? d : (d.data || d.comics || []);
    const items = arr.map(m => ({ source: 'comick', id: m.slug || m.hid, slug: m.slug,
      title: m.title || m.name || '(untitled)', poster: null }));
    // ComicK search returns no covers — enrich from each comic page's og:image in parallel (best-effort)
    await Promise.all(items.map(async it => {
      if (!it.slug) return;
      try {
        const r = await httpGet(CK + '/comic/' + it.slug, { Referer: CK_REF });
        const m = r.body.match(/property="og:image"\s+content="([^"]+)"/i) || r.body.match(/content="(https:\/\/meo[^"]+)"\s+property="og:image"/i);
        if (m) it.poster = m[1];
      } catch (e) {}
    }));
    return items.map(it => ({ source: it.source, id: it.id, title: it.title, poster: it.poster }));
  },
  async chapters(slug) {
    let all = [], page = 1;
    for (;;) {
      const d = await getJson(CK + '/api/comics/' + encodeURIComponent(slug) + '/chapter-list?lang=en&page=' + page, { Referer: CK_REF });
      const arr = (d && d.data) || [];
      arr.forEach(c => { if (c.chap != null) all.push({ id: c.hid, chap: String(c.chap), title: c.title || '' }); });
      if (!arr.length || page > 30) break;
      page++;
    }
    return dedupeChapters(all.sort(numAsc));
  },
  async pages(slugAndHid) {
    // id passed as "slug|hid|chap"
    const parts = String(slugAndHid).split('|');
    const slug = parts[0], hid = parts[1], chap = parts[2] || '';
    const r = await httpGet(CK + '/comic/' + encodeURIComponent(slug) + '/' + hid + '-chapter-' + chap + '-en', { Referer: CK_REF });
    let pages = [];
    const m = r.body.match(/<script id="sv-data"[^>]*>([\s\S]*?)<\/script>/);
    if (m) {
      try {
        const j = JSON.parse(m[1]);
        const imgs = (j.chapter && j.chapter.images) || (j.images) || [];
        pages = imgs.map(x => x.url).filter(Boolean);
      } catch (e) {}
    }
    if (!pages.length) {
      // fallback: any cdn image urls in the page
      const re = /https:\/\/[a-z0-9.]*comick[a-z0-9.]*\/[^\s"']+\.(?:webp|jpg|jpeg|png)/gi;
      pages = Array.from(new Set(r.body.match(re) || []));
    }
    return { pages, referer: CK_REF };
  },
};

// ---------------- WeebCentral (HTML, no referer) ----------------
const WC = 'https://weebcentral.com';
const weebcentral = {
  referer: '',
  async search(q) {
    const r = await httpGet(WC + '/search/data?text=' + encodeURIComponent(q) + '&sort=Best+Match&order=Descending&official=Any&display_mode=Full+Display', { Referer: WC + '/' });
    const out = [], seen = new Set();
    const re = /href="https:\/\/weebcentral\.com\/series\/([A-Z0-9]+)\/([^"]+)"/g;
    let m;
    while ((m = re.exec(r.body))) {
      if (seen.has(m[1])) continue; seen.add(m[1]);
      out.push({ source: 'weebcentral', id: m[1], title: decodeURIComponent(m[2]).replace(/-/g, ' '),
        poster: 'https://temp.compsci88.com/cover/normal/' + m[1] + '.webp' });
      if (out.length >= 12) break;
    }
    return out;
  },
  async chapters(id) {
    const r = await httpGet(WC + '/series/' + id + '/full-chapter-list', { Referer: WC + '/' });
    const out = [];
    const re = /href="https:\/\/weebcentral\.com\/chapters\/([A-Z0-9]+)"[\s\S]*?(?:Chapter|Episode)\s+([\d.]+)/g;
    let m;
    while ((m = re.exec(r.body))) out.push({ id: m[1], chap: m[2], title: '' });
    out.reverse(); // listed newest-first
    return dedupeChapters(out.sort(numAsc));
  },
  async pages(chapterId) {
    const r = await httpGet(WC + '/chapters/' + chapterId + '/images?is_prev=False&reading_style=long_strip', { Referer: WC + '/' });
    const pages = [];
    const re = /<img[^>]+src="([^"]+)"/g; let m;
    while ((m = re.exec(r.body))) { if (/^https?:/.test(m[1])) pages.push(m[1]); }
    return { pages, referer: '' };
  },
};

// ---------------- Mangapill (HTML, referer required) ----------------
const MP = 'https://mangapill.com';
const MP_REF = 'https://mangapill.com/';
const mangapill = {
  referer: MP_REF,
  async search(q) {
    const r = await httpGet(MP + '/search?q=' + encodeURIComponent(q) + '&type=&status=', { Referer: MP_REF });
    const out = [], seen = new Set();
    const re = /href="\/manga\/(\d+)\/([^"]+)"/g; let m;
    while ((m = re.exec(r.body))) {
      const key = m[1]; if (seen.has(key)) continue; seen.add(key);
      out.push({ source: 'mangapill', id: m[1] + '/' + m[2], title: m[2].replace(/-/g, ' '),
        poster: 'https://cdn.readdetectiveconan.com/file/mangapill/i/' + m[1] + '.jpeg' });
      if (out.length >= 12) break;
    }
    return out;
  },
  async chapters(idSlug) {
    const r = await httpGet(MP + '/manga/' + idSlug, { Referer: MP_REF });
    const out = [], seen = new Set();
    const re = /href="(\/chapters\/[\d-]+\/[^"]*-chapter-([\d.]+)[^"]*)"/g; let m;
    while ((m = re.exec(r.body))) { if (seen.has(m[1])) continue; seen.add(m[1]); out.push({ id: m[1], chap: m[2], title: '' }); }
    return dedupeChapters(out.sort(numAsc));
  },
  async pages(chapterPath) {
    const r = await httpGet(mustHost(MP + chapterPath, 'mangapill.com'), { Referer: MP_REF });
    const pages = [];
    const re = /data-src="([^"]+)"/g; let m;
    while ((m = re.exec(r.body))) { if (/^https?:/.test(m[1])) pages.push(m[1]); }
    return { pages, referer: MP_REF };
  },
};

// ---------------- MangaKatana (HTML, no referer, octet-stream imgs) ----------------
const MK = 'https://mangakatana.com';
const mangakatana = {
  referer: 'https://mangakatana.com/',
  async search(q) {
    const r = await httpGet(MK + '/?search=' + encodeURIComponent(q) + '&search_by=book_name', { Referer: MK + '/' });
    // exact match may redirect straight to a book page
    const out = [], seen = new Set();
    const re = /href="(https:\/\/mangakatana\.com\/manga\/[^"]+\.\d+)"/g; let m;
    while ((m = re.exec(r.body))) {
      const id = m[1].replace('https://mangakatana.com/manga/', '');
      if (seen.has(id)) continue; seen.add(id);
      out.push({ source: 'mangakatana', id, title: id.replace(/\.\d+$/, '').replace(/-/g, ' '), poster: null });
      if (out.length >= 12) break;
    }
    if (!out.length && /\/manga\/[^"]+\.\d+/.test(r.finalUrl || '')) {
      const id = (r.finalUrl).replace('https://mangakatana.com/manga/', '');
      out.push({ source: 'mangakatana', id, title: id.replace(/\.\d+$/, '').replace(/-/g, ' '), poster: null });
    }
    return out;
  },
  async chapters(id) {
    const r = await httpGet(MK + '/manga/' + id, { Referer: MK + '/' });
    const out = [], seen = new Set();
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('href="(https://mangakatana\\.com/manga/' + esc + '/c([\\d.]+)[^"]*)"', 'g'); let m;
    while ((m = re.exec(r.body))) { if (seen.has(m[2])) continue; seen.add(m[2]); out.push({ id: m[1], chap: m[2], title: '' }); }
    return dedupeChapters(out.sort(numAsc));
  },
  async pages(chapterUrl) {
    const r = await httpGet(mustHost(chapterUrl, 'mangakatana.com'), { Referer: MK + '/' });
    let pages = [];
    // images live in a JS array (thzq is the real one; ytaw is a 1-element decoy). Grab the
    // longest js array of image-looking urls so we don't pick the decoy/ad slot.
    const arrays = r.body.match(/\[\s*'https?:[^\]]*?'\s*(?:,\s*'https?:[^\]]*?'\s*)*\]/g) || [];
    let best = [];
    for (const a of arrays) {
      const urls = (a.match(/'([^']+)'/g) || []).map(s => s.slice(1, -1)).filter(u => /^https?:.*\.(jpg|jpeg|png|webp)/i.test(u) || /mangakatana|\/token\//i.test(u));
      if (urls.length > best.length) best = urls;
    }
    pages = best;
    return { pages, referer: MK + '/' };
  },
};

// ================= DEDICATED MANHWA sources (reuse the same reader) =================

// ---- AsuraScans (JSON API, no referer) ----
const ASU = 'https://api.asurascans.com';
const asura = {
  referer: '',
  async search(q) {
    const d = await getJson(ASU + '/api/search?q=' + encodeURIComponent(q));
    return (d.data || []).map(m => ({ source: 'asura', id: m.slug, title: m.title || '(untitled)', poster: m.cover || null }));
  },
  async chapters(slug) {
    const d = await getJson(ASU + '/api/series/' + encodeURIComponent(slug) + '/chapters');
    const out = (d.data || []).filter(c => !c.is_locked && !c.is_premium)
      .map(c => ({ id: slug + '|' + c.number, chap: String(c.number), title: c.title || '' }));
    return dedupeChapters(out.sort(numAsc));
  },
  async pages(slugNum) {
    const p = String(slugNum).split('|');
    const d = await getJson(ASU + '/api/series/' + encodeURIComponent(p[0]) + '/chapters/' + encodeURIComponent(p[1]));
    const pages = ((((d.data || {}).chapter || {}).pages) || []).map(x => x.url).filter(Boolean);
    return { pages, referer: '' };
  },
};

// ---- LINE Webtoons (OFFICIAL; images need referer https://www.webtoons.com/) ----
const WT_REF = 'https://www.webtoons.com/';
const webtoons = {
  referer: WT_REF,
  async search(q) {
    const d = await getJson('https://www.webtoons.com/en/search/immediate?keyword=' + encodeURIComponent(q), { Referer: WT_REF });
    const list = (((d.result || {}).searchedList) || (d.searchedList) || []);
    return list.map(m => ({ source: 'webtoons', id: String(m.titleNo), title: m.title || '(untitled)',
      poster: m.thumbnailMobile ? ('https://swebtoon-phinf.pstatic.net' + m.thumbnailMobile) : (m.thumbnail ? ('https://swebtoon-phinf.pstatic.net' + m.thumbnail) : null) }));
  },
  async chapters(titleNo) {
    let out = [], seen = new Set();
    for (let page = 1; page <= 80; page++) {
      const r = await httpGet('https://www.webtoons.com/en/x/x/list?title_no=' + titleNo + '&page=' + page, { Referer: WT_REF });
      const before = seen.size;
      const re = /data-episode-no="(\d+)"/g; let m;
      while ((m = re.exec(r.body))) { const n = m[1]; if (!seen.has(n)) { seen.add(n); out.push({ id: titleNo + '|' + n, chap: n, title: '' }); } }
      if (seen.size === before) break;  // page clamped — no new episodes
    }
    return out.sort(numAsc);
  },
  async pages(idEp) {
    const p = String(idEp).split('|');
    const r = await httpGet('https://www.webtoons.com/en/x/x/x/viewer?title_no=' + p[0] + '&episode_no=' + p[1], { Referer: WT_REF });
    const pages = [];
    const re = /data-url="(https:\/\/webtoon-phinf\.pstatic\.net\/[^"]+\.(?:jpg|jpeg|png)[^"]*)"/gi; let m;
    while ((m = re.exec(r.body))) pages.push(m[1]);
    return { pages, referer: WT_REF };
  },
};

// ---- Flame Comics (Next.js data API, buildId rotates; no referer) ----
let flameBuild = { id: null, ts: 0 };
async function flameBuildId() {
  if (flameBuild.id && (Date.now() - flameBuild.ts) < 10 * 60 * 1000) return flameBuild.id;
  const r = await httpGet('https://flamecomics.xyz/');
  const m = r.body.match(/"buildId":"([^"]+)"/);
  flameBuild = { id: m ? m[1] : null, ts: Date.now() };
  return flameBuild.id;
}
const flame = {
  referer: '',
  async search(q) {
    const b = await flameBuildId(); if (!b) return [];
    const d = await getJson('https://flamecomics.xyz/_next/data/' + b + '/browse.json');
    const series = ((d.pageProps || {}).series) || [];
    const ql = q.toLowerCase();
    return series.filter(s => s.series_id && (s.title || '').toLowerCase().includes(ql)).slice(0, 12)
      .map(s => ({ source: 'flame', id: String(s.series_id), title: s.title,
        poster: 'https://cdn.flamecomics.xyz/uploads/images/series/' + s.series_id + '/' + s.cover }));
  },
  async chapters(seriesId) {
    const b = await flameBuildId();
    const d = await getJson('https://flamecomics.xyz/_next/data/' + b + '/series/' + seriesId + '.json?id=' + seriesId);
    const chs = ((d.pageProps || {}).chapters) || [];
    return dedupeChapters(chs.map(c => ({ id: seriesId + '|' + c.token, chap: String(parseFloat(c.chapter)), title: c.title || '' })).sort(numAsc));
  },
  async pages(idToken) {
    const b = await flameBuildId();
    const p = String(idToken).split('|');
    const d = await getJson('https://flamecomics.xyz/_next/data/' + b + '/series/' + p[0] + '/' + p[1] + '.json?id=' + p[0] + '&token=' + p[1]);
    const imgs = ((((d.pageProps || {}).chapter) || {}).images) || {};
    const keys = Object.keys(imgs).sort((a, b) => parseInt(a) - parseInt(b));
    const pages = keys.map(k => 'https://cdn.flamecomics.xyz/uploads/images/series/' + p[0] + '/' + p[1] + '/' + imgs[k].name);
    return { pages, referer: '' };
  },
};

// ================= RAW (untranslated Japanese) manga sources =================
// Korean manhwa raws have NO reliable headless source (toki family govt-shutdown 2026-04),
// so only JP manga raws are offered. rawkuma's AJAX search is nonce-blocked, so we derive the
// romaji slug (slugify the query, plus MangaDex ja-ro alt-titles as a fallback) and probe the page.

// ---- Rawkuma (JP raw, primary) ----
const RK = 'https://rawkuma.net';
const rawkuma = {
  referer: '',
  async search(q) {
    const slugs = [];
    const push = s => { if (s && slugs.indexOf(s) < 0) slugs.push(s); };
    push(slugify(q));
    try { // MangaDex romaji assist for non-obvious slugs
      const d = await getJson(MD + '/manga?title=' + encodeURIComponent(q) + '&limit=5');
      (d.data || []).forEach(m => {
        const t = m.attributes.title.en || Object.values(m.attributes.title || {})[0];
        push(slugify(t));
        (m.attributes.altTitles || []).forEach(a => { if (a['ja-ro']) push(slugify(a['ja-ro'])); });
      });
    } catch (e) {}
    const out = [], seen = new Set();
    for (const slug of slugs.slice(0, 6)) {
      try {
        const r = await httpGet(RK + '/manga/' + slug + '/');
        const mid = (r.body.match(/manga_id["'\s:=]+(\d+)/) || [])[1];
        if (r.status !== 200 || !mid || seen.has(mid)) continue;
        seen.add(mid);
        const title = ((r.body.match(/<h1[^>]*itemprop="name"[^>]*>([^<]+)/) || r.body.match(/<title>([^<|]+)/) || [])[1] || slug.replace(/-/g, ' ')).trim();
        const poster = (r.body.match(/property="og:image"\s+content="([^"]+)"/) || [])[1] || null;
        out.push({ source: 'rawkuma', id: slug + '|' + mid, title: title, poster: poster });
      } catch (e) {}
    }
    return out;
  },
  async chapters(slugMid) {
    const mid = String(slugMid).split('|')[1];
    const r = await httpGet(RK + '/wp-admin/admin-ajax.php?action=chapter_list&manga_id=' + mid);
    const out = [];
    // href is chapter-{num}.{chapId} — the trailing group is a big chapter-id (4+ digits), NOT
    // part of the number. Drop it only when it's clearly an id, so real decimals (271.5) survive.
    const re = /href="(https:\/\/rawkuma\.net\/manga\/[^"]*chapter-([\d.]+)[^"]*)"/g; let m;
    while ((m = re.exec(r.body))) {
      const parts = m[2].split('.');
      let num = m[2];
      if (parts.length >= 2 && parts[parts.length - 1].length >= 4) { parts.pop(); num = parts.join('.'); }
      out.push({ id: m[1], chap: num, title: '' });
    }
    return dedupeChapters(out.sort(numAsc));
  },
  async pages(chapterUrl) {
    const r = await httpGet(mustHost(chapterUrl, 'rawkuma.net'));
    const pages = [];
    // rawkuma's reader image host varies by chapter age (kumacdn / kyut.dev), lazy-loaded
    const re = /(?:src|data-src|data-lazy-src)=['"]([^'"]*(?:kumacdn|kyut\.dev)[^'"]+\.(?:jpg|jpeg|png|webp))['"]/gi; let m;
    while ((m = re.exec(r.body))) pages.push(m[1]);
    return { pages, referer: '' };
  },
};

// ---- Rawinu (JP raw, backup) ----
const RI = 'https://rawinu.com';
const rawinu = {
  referer: '',
  async search(q) {
    const out = [], seen = new Set();
    const add = slug => { if (slug && !seen.has(slug)) { seen.add(slug); out.push({ source: 'rawinu', id: slug, title: slug.replace(/-/g, ' '), poster: null }); } };
    try {
      const r = await httpGet(RI + '/manga-list.html?key=' + encodeURIComponent(q));
      const re = /\/manga-([a-z0-9-]+)-raw\.html/gi; let m;
      while ((m = re.exec(r.body)) && out.length < 12) add(m[1]);
    } catch (e) {}
    if (!out.length) {
      // fallback: probe the direct slug page (search box is flaky)
      const slug = slugify(q);
      try { const r2 = await httpGet(RI + '/manga-' + slug + '-raw.html'); if (r2.status === 200 && /unir-[a-z0-9-]+-raw-chapter-/i.test(r2.body)) add(slug); } catch (e) {}
    }
    return out;
  },
  async chapters(slug) {
    const r = await httpGet(RI + '/manga-' + slug + '-raw.html');
    const out = [], seen = new Set();
    const re = /href="(?:https:\/\/rawinu\.com)?(\/unir-[a-z0-9-]+-raw-chapter-([\d.]+)\.html)"/gi; let m;
    while ((m = re.exec(r.body))) { if (seen.has(m[2])) continue; seen.add(m[2]); out.push({ id: RI + m[1], chap: m[2], title: '' }); }
    return dedupeChapters(out.sort(numAsc));
  },
  async pages(chapterUrl) {
    const r = await httpGet(mustHost(chapterUrl, 'rawinu.com'));
    const pages = [];
    const re = /(?:src|data-src|data-lazy-src)=['"]([^'"]*ihlv1\.xyz\/[^'"]+\.(?:jpg|jpeg|png|webp))['"]/gi; let m;
    while ((m = re.exec(r.body))) pages.push(m[1]);
    return { pages, referer: '' };
  },
};

// ---- BlackToon (블랙툰) — KOREAN MANHWA RAWS ----
// The only reliable Korean raw source (toki/toonkor are Cloudflare-walled even via Tor).
// Domain rotates (blacktoon41N.com) but config.js on the STABLE CDN self-reports the current
// site_url, so we stay current automatically. Search maps EN->KO via MangaDex altTitles[].ko.
const BT_INC = 'https://inc.toonimg7.com';
let btState = { host: null, imgBase: null, catUrl: null, catalog: null, ts: 0 };
function btNorm(s) { return String(s || '').replace(/[\s·:_,.\-!?'"()~]/g, '').toLowerCase(); }
async function btBootstrap() {
  if (btState.host && (Date.now() - btState.ts) < 30 * 60 * 1000) return;
  let site = 'blacktoon412.com', img = 'https://webimg7.com/';
  try {
    const cfg = (await httpGet(BT_INC + '/data/config.js', { Referer: 'https://blacktoon412.com/' })).body;
    site = (cfg.match(/site_url\s*=\s*"([^"]+)"/) || [])[1] || site;
    img = (cfg.match(/img_domain\s*=\s*"([^"]+)"/) || [])[1] || img;
  } catch (e) {}
  const host = 'https://' + site.replace(/^https?:\/\//, '').replace(/\/$/, '');
  let catUrl = null;
  try {
    const home = await httpGet(host + '/', { Referer: host + '/' });
    const m = home.body.match(/\/data\/webtoon\/webtoon_1_[0-9]+\.js/);
    if (m) catUrl = host + m[0];
  } catch (e) {}
  btState = { host, imgBase: img.replace(/\/$/, ''), catUrl, catalog: null, ts: Date.now() };
}
async function btCatalog() {
  await btBootstrap();
  if (btState.catalog) return btState.catalog;
  if (!btState.catUrl) return [];
  const r = await httpGet(btState.catUrl, { Referer: btState.host + '/' });
  const s = r.body.indexOf('['), e = r.body.lastIndexOf(']');
  let arr = []; try { arr = JSON.parse(r.body.slice(s, e + 1)); } catch (ex) {}
  btState.catalog = arr;
  return arr;
}
async function koTitles(q) {
  const ko = [];
  try {
    const d = await getJson(MD + '/manga?title=' + encodeURIComponent(q) + '&limit=5');
    (d.data || []).forEach(m => (m.attributes.altTitles || []).forEach(a => { if (a.ko) ko.push(a.ko); }));
  } catch (e) {}
  return ko;
}
const blacktoon = {
  referer: '',
  async search(q) {
    const cat = await btCatalog();
    if (!cat.length) return [];
    const needles = (await koTitles(q)).map(btNorm);
    if (/[가-힣]/.test(q)) needles.push(btNorm(q));  // query already Korean
    if (!needles.length) return [];
    const out = [], seen = new Set();
    for (const o of cat) {
      const nt = btNorm(o.t);
      if (needles.some(n => n && (nt.includes(n) || n.includes(nt)))) {
        if (seen.has(o.x)) continue; seen.add(o.x);
        out.push({ source: 'blacktoon', id: String(o.x), title: o.t, poster: null });
        if (out.length >= 12) break;
      }
    }
    return out;
  },
  async chapters(id) {
    await btBootstrap();
    const r = await httpGet(BT_INC + '/data/toonlist/' + id + '.js', { Referer: btState.host + '/' });
    const s = r.body.indexOf('['), e = r.body.lastIndexOf(']');
    let clist = []; try { clist = JSON.parse(r.body.slice(s, e + 1)); } catch (ex) {}
    // toonlist is oldest-first (index 0 = ch1/prologue); the per-item `c` field is unreliable,
    // so number sequentially by array position and keep that order (last = latest raw).
    return clist.filter(c => c.u).map((c, i) => ({ id: btState.host + c.u, chap: String(i + 1), title: '' }));
  },
  async pages(chapterUrl) {
    await btBootstrap();
    const r = await httpGet(mustHost(chapterUrl, new URL(btState.host).hostname), { Referer: btState.host + '/' });
    const pages = [];
    const re = /o_src=["']([^"']+)["']/g; let m;
    while ((m = re.exec(r.body))) {
      const p = m[1];
      pages.push(/^https?:/.test(p) ? p : (btState.imgBase + '/' + p.replace(/^\//, '')));
    }
    return { pages, referer: btState.host + '/' };
  },
};

const SOURCES = { mangadex, comick, weebcentral, mangapill, mangakatana, asura, webtoons, flame, rawkuma, rawinu, blacktoon };
// ComicK first = broadest coverage incl. licensed titles (MangaDex lacks licensed manga like
// One Piece / Grand Blue, so it's NOT the default — kept for scanlation-only titles).
const SOURCE_ORDER = ['comick', 'weebcentral', 'mangapill', 'mangadex', 'mangakatana'];

function mountManga(app) {
  // search: default = mangadex; ?source=all merges every source
  app.get('/api/manga/search', async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ results: [] });
    const src = req.query.source || 'mangadex';
    try {
      if (src === 'all') {
        const lists = await Promise.all(SOURCE_ORDER.map(s => SOURCES[s].search(q).catch(() => [])));
        return res.json({ results: [].concat.apply([], lists) });
      }
      if (!SOURCES[src]) return res.status(400).json({ error: 'unknown source', results: [] });
      const results = await SOURCES[src].search(q);
      res.json({ results });
    } catch (e) { res.status(502).json({ error: e.message, results: [] }); }
  });
  app.get('/api/manga/chapters', async (req, res) => {
    const src = req.query.source, id = req.query.id;
    if (!src || !SOURCES[src] || !id) return res.status(400).json({ error: 'source+id required', chapters: [] });
    try { res.json({ chapters: await SOURCES[src].chapters(id) }); }
    catch (e) { res.status(502).json({ error: e.message, chapters: [] }); }
  });
  app.get('/api/manga/pages', async (req, res) => {
    const src = req.query.source, id = req.query.id;
    if (!src || !SOURCES[src] || !id) return res.status(400).json({ error: 'source+id required', pages: [] });
    try { const r = await SOURCES[src].pages(id); res.json(r); }
    catch (e) { res.status(502).json({ error: e.message, pages: [] }); }
  });
  app.get('/api/manga/sources', (_req, res) => res.json({ sources: SOURCE_ORDER }));
}

module.exports = { mountManga };
