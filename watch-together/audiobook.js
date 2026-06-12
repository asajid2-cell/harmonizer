'use strict';
// Audio: audiobooks, podcasts, and music. search -> items; chapters/episodes -> [{title,url}];
// music has a stream-resolve step (Audius direct / YouTube via yt-dlp). The frontend audio
// player streams everything via /api/proxy (Range-supported, so seeking works).
const https = require('https');
const { execFile } = require('child_process');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
function httpGet(url, headers, redirects) {
  redirects = redirects == null ? 4 : redirects;
  return new Promise((resolve, reject) => {
    let u; try { u = new URL(url); } catch (e) { return reject(e); }
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: Object.assign({ 'User-Agent': UA, 'Accept': '*/*' }, headers || {}) }, r => {
      if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location && redirects > 0) {
        r.resume(); return httpGet(new URL(r.headers.location, url).href, headers, redirects - 1).then(resolve, reject);
      }
      const ch = []; r.on('data', c => ch.push(c)); r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(ch).toString('utf8') }));
    });
    req.on('error', reject); req.setTimeout(20000, () => req.destroy(new Error('timeout'))); req.end();
  });
}
function getJson(u, h) { return httpGet(u, h).then(r => JSON.parse(r.body)); }
function dec(s) { return String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&#8217;/g, "'").replace(/&#8211;/g, '-').replace(/\s+/g, ' ').trim(); }

// ---- LibriVox (public domain, keyless API) ----
const LV = 'https://librivox.org/api/feed/audiobooks';
const librivox = {
  async search(q) {
    const d = await getJson(LV + '/?title=' + encodeURIComponent(q) + '&format=json&limit=15');
    return (d.books || []).map(b => {
      const item = (b.url_zip || '').match(/download\/([^/]+)\//);
      const a = (b.authors || [])[0] || {};
      return { source: 'librivox', id: String(b.id), title: b.title || 'Untitled',
        author: ((a.first_name || '') + ' ' + (a.last_name || '')).trim(),
        cover: item ? ('https://archive.org/services/img/' + item[1]) : null };
    });
  },
  async chapters(id) {
    const d = await getJson(LV + '/?id=' + id + '&format=json&extended=1');
    const b = (d.books || [])[0]; if (!b) return { chapters: [], referer: '' };
    return { chapters: (b.sections || []).map((s, i) => ({ title: dec(s.title) || ('Section ' + (i + 1)), url: s.listen_url })).filter(c => c.url), referer: '' };
  },
};

// ---- Internet Archive (keyless, broad) ----
const archive = {
  async search(q) {
    const url = 'https://archive.org/advancedsearch.php?q=' + encodeURIComponent('(title:("' + q + '")) AND mediatype:audio')
      + '&fl[]=identifier&fl[]=title&fl[]=creator&sort[]=downloads+desc&rows=15&output=json';
    const d = await getJson(url);
    return ((d.response || {}).docs || []).map(x => ({ source: 'archive', id: x.identifier,
      title: x.title || x.identifier, author: Array.isArray(x.creator) ? x.creator[0] : (x.creator || ''),
      cover: 'https://archive.org/services/img/' + x.identifier }));
  },
  async chapters(id) {
    const m = await getJson('https://archive.org/metadata/' + id);
    const files = (m.files || []).filter(f => /\.mp3$/i.test(f.name)).sort((a, b) => (a.name > b.name ? 1 : -1));
    return { chapters: files.map(f => ({ title: dec(f.title) || f.name.replace(/\.mp3$/i, ''), url: 'https://archive.org/download/' + id + '/' + encodeURIComponent(f.name) })), referer: '' };
  },
};

// ---- ipaudio family (golden/big/fulllength — copyrighted; WordPress + ipaudio CDN) ----
function wpAudiobook(srcName, host) {
  return {
    async search(q) {
      const r = await httpGet('https://' + host + '/?s=' + encodeURIComponent(q));
      const out = [], seen = new Set();
      const re = /<a\s([^>]*\brel="bookmark"[^>]*)>([\s\S]*?)<\/a>/gi; let m;
      while ((m = re.exec(r.body)) && out.length < 15) {
        const href = ((m[1].match(/href="([^"]+)"/) || [])[1] || '').replace(/&amp;/g, '&');
        const t = dec(m[2]);
        if (!href || !t || seen.has(href) || !/audiobook/i.test(href)) continue;
        seen.add(href);
        out.push({ source: srcName, id: href, title: t, author: '', cover: null });
      }
      return out;
    },
    async chapters(url) {
      const r = await httpGet(url);
      const cover = (r.body.match(/og:image["']?\s*content=["']([^"']+)/i) || [])[1] || null;
      const urls = [...new Set((r.body.match(/https:\/\/[a-z0-9.]*ipaudio[a-z0-9.]*\/[^"'\s)]+\.mp3/gi) || []))].sort();
      return { chapters: urls.map((u, i) => ({ title: 'Part ' + (i + 1), url: u.replace(/&amp;/g, '&') })), referer: '', cover };
    },
  };
}

const AB_SOURCES = {
  librivox, archive,
  golden: wpAudiobook('golden', 'goldenaudiobooks.com'),
  big: wpAudiobook('big', 'bigaudiobooks.com'),
  fulllength: wpAudiobook('fulllength', 'fulllengthaudiobooks.com'),
};

// ---- Podcasts (keyless iTunes Search + RSS) ----
function decX(s) { return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim(); }
const podcasts = {
  async search(q) {
    const d = await getJson('https://itunes.apple.com/search?media=podcast&term=' + encodeURIComponent(q) + '&limit=18');
    return (d.results || []).filter(p => p.feedUrl).map(p => ({
      source: 'podcast', id: p.feedUrl, title: p.collectionName || 'Untitled',
      author: p.artistName || '', cover: p.artworkUrl600 || p.artworkUrl100 || null }));
  },
  async episodes(feedUrl) {
    const r = await httpGet(feedUrl, { Accept: 'application/rss+xml, application/xml, */*' });
    const chapters = [];
    for (const it of (r.body.match(/<item[\s\S]*?<\/item>/gi) || []).slice(0, 300)) {
      const url = (it.match(/<enclosure[^>]*\burl=["']([^"']+)["']/i) || [])[1];
      if (!url) continue;
      chapters.push({ title: decX((it.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || 'Episode'), url });
    }
    return { chapters, referer: '' };
  },
};

// ---- Music (Audius = direct full-track; YouTube = yt-dlp full-track) ----
function ytdlp(args, ms) {
  return new Promise((resolve, reject) => {
    execFile('yt-dlp', args, { timeout: ms || 45000, maxBuffer: 24 * 1024 * 1024 }, (err, stdout) => {
      if (err && !(stdout || '').trim()) return reject(err);
      resolve(stdout || '');
    });
  });
}
let audiusHost = null, audiusTs = 0;
async function audiusGetHost() {
  if (audiusHost && Date.now() - audiusTs < 30 * 60 * 1000) return audiusHost;
  const d = await getJson('https://api.audius.co');
  audiusHost = (d.data || [])[0]; audiusTs = Date.now();
  return audiusHost;
}
// SoundCloud (api-v2; client_id scraped from the site). Filtered to progressive (plain mp3)
// tracks so playback always works — official major-label tracks are cbc-encrypted-hls and skipped.
let scClientId = null, scTs = 0;
async function scGetClientId() {
  if (scClientId && Date.now() - scTs < 60 * 60 * 1000) return scClientId;
  const home = await httpGet('https://soundcloud.com/');
  const scripts = [...new Set((home.body.match(/https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js/g) || []))];
  for (const s of scripts.reverse()) {
    try { const js = await httpGet(s); const m = js.body.match(/client_id[:=]"([a-zA-Z0-9]{20,})"/); if (m) { scClientId = m[1]; scTs = Date.now(); return scClientId; } } catch (e) {}
  }
  return null;
}
const GD = 'https://music-api.gdstudio.xyz/api.php';
const MUSIC_SOURCES = {
  // GD-Studio aggregator → NetEase: mainstream catalog at lossless/hi-bitrate (br 999=FLAC).
  // Stream URLs are NetEase CDN (music.126.net), reachable from the VPS. Rate-limited on bursts.
  gdstudio: {
    async search(q) {
      for (let attempt = 0; attempt < 2; attempt++) {            // retry once on transient rate-limit/empty
        try {
          const d = await getJson(GD + '?types=search&source=netease&name=' + encodeURIComponent(q) + '&count=20');
          if (Array.isArray(d) && d.length) return d.map(t => ({ source: 'gdstudio', id: String(t.id),
            title: t.name || '', artist: Array.isArray(t.artist) ? t.artist.join(', ') : (t.artist || ''),
            cover: t.pic_id ? ((process.env.BASE_PATH || '') + '/api/music/cover?source=gdstudio&id=' + encodeURIComponent(t.pic_id)) : null, duration: 0 }));
        } catch (e) {}
        if (attempt === 0) await new Promise(r => setTimeout(r, 900));
      }
      return [];
    },
    async stream(id) {
      for (const br of [999, 320, 128]) {
        try { const d = await getJson(GD + '?types=url&source=netease&id=' + id + '&br=' + br); if (d && d.url) return { url: d.url, referer: '' }; } catch (e) {}
      }
      return { url: null };
    },
  },
  soundcloud: {
    async search(q) {
      const cid = await scGetClientId(); if (!cid) return [];
      const d = await getJson('https://api-v2.soundcloud.com/search/tracks?q=' + encodeURIComponent(q) + '&client_id=' + cid + '&limit=20');
      return (d.collection || []).filter(t => t.kind === 'track' && ((t.media || {}).transcodings || []).some(x => x.format.protocol === 'progressive'))
        .map(t => ({ source: 'soundcloud', id: String(t.id), title: t.title || '', artist: (t.user || {}).username || '',
          cover: (t.artwork_url || '').replace('-large', '-t200x200') || null, duration: Math.round((t.duration || 0) / 1000) }));
    },
    async stream(id) {
      const cid = await scGetClientId(); if (!cid) return { url: null };
      const t = await getJson('https://api-v2.soundcloud.com/tracks/' + id + '?client_id=' + cid);
      const prog = ((t.media || {}).transcodings || []).find(x => x.format.protocol === 'progressive');
      if (!prog) return { url: null };
      const s = await getJson(prog.url + '?client_id=' + cid);
      return { url: s.url, referer: '' };
    },
  },
  audius: {
    async search(q) {
      const host = await audiusGetHost();
      const d = await getJson(host + '/v1/tracks/search?query=' + encodeURIComponent(q) + '&app_name=watchtogether&limit=20');
      return (d.data || []).map(t => ({ source: 'audius', id: t.id, title: t.title || '', artist: (t.user || {}).name || '',
        cover: (t.artwork || {})['150x150'] || (t.artwork || {})['480x480'] || null, duration: t.duration }));
    },
    async stream(id) { const host = await audiusGetHost(); return { url: host + '/v1/tracks/' + id + '/stream', referer: '' }; },
  },
  // Jamendo — CC / royalty-free catalog (legal, IP-unlocked, distinct backend). Use the signed
  // `audio` (mp31) field, NOT `audiodownload` (which 302s to text/html through the proxy).
  jamendo: {
    async search(q) {
      const d = await getJson('https://api.jamendo.com/v3.0/tracks/?client_id=2c9a11b9&format=json&limit=20&search=' + encodeURIComponent(q));
      return (d.results || []).map(t => ({ source: 'jamendo', id: String(t.id), title: t.name || '',
        artist: t.artist_name || '', cover: t.album_image || t.image || null, duration: t.duration || 0 }));
    },
    async stream(id) {
      const d = await getJson('https://api.jamendo.com/v3.0/tracks/?client_id=2c9a11b9&format=json&id=' + encodeURIComponent(id));
      const t = (d.results || [])[0];
      if (!t || !t.audio) return { url: null };
      return { url: t.audio, referer: '' };
    },
  },
  // Live radio — Radio Browser directory (keyless, thousands of stations). Filter hls===0 (HLS
  // stations are the video lane, not <audio>) + lastcheckok. Continuous streams return 200 audio/*.
  radio: {
    async search(q) {
      const d = await getJson('https://de1.api.radio-browser.info/json/stations/byname/' + encodeURIComponent(q) + '?limit=40&hidebroken=true&order=clickcount&reverse=true');
      return (Array.isArray(d) ? d : []).filter(s => s.url_resolved && s.lastcheckok && s.hls === 0)
        .map(s => ({ source: 'radio', id: s.stationuuid, title: s.name || 'Station',
          artist: [s.country, s.codec, s.bitrate ? s.bitrate + 'k' : ''].filter(Boolean).join(' · '),
          cover: s.favicon || null, duration: 0 }));
    },
    async stream(id) {
      const d = await getJson('https://de1.api.radio-browser.info/json/stations/byuuid/' + encodeURIComponent(id));
      const s = (Array.isArray(d) ? d : [])[0];
      return s ? { url: s.url_resolved, referer: '' } : { url: null };
    },
  },
  youtube: {
    async search(q) {
      const d = JSON.parse(await ytdlp(['--flat-playlist', '-J', '--no-warnings', 'ytsearch15:' + q], 30000));
      return (d.entries || []).filter(e => e && e.id).map(e => ({ source: 'youtube', id: e.id, title: e.title || '',
        artist: e.uploader || e.channel || '', cover: 'https://i.ytimg.com/vi/' + e.id + '/mqdefault.jpg', duration: e.duration }));
    },
    async stream(id) {
      // prefer m4a (audio/mp4 — plays in Safari too) over webm/opus
      const u = (await ytdlp(['-f', 'bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio', '--get-url', '--no-warnings', 'https://www.youtube.com/watch?v=' + id], 45000)).trim().split('\n').filter(Boolean)[0];
      return { url: u, referer: '' };
    },
  },
};

function mountAudiobooks(app) {
  app.get('/api/audiobook/search', async (req, res) => {
    const q = (req.query.q || '').trim(), src = req.query.source || 'librivox';
    if (!q) return res.json({ results: [] });
    if (!AB_SOURCES[src]) return res.status(400).json({ error: 'unknown source', results: [] });
    try { res.json({ results: await AB_SOURCES[src].search(q) }); }
    catch (e) { res.status(502).json({ error: e.message, results: [] }); }
  });
  app.get('/api/audiobook/chapters', async (req, res) => {
    const src = req.query.source, id = req.query.id;
    if (!src || !AB_SOURCES[src] || !id) return res.status(400).json({ error: 'source+id required', chapters: [] });
    try { res.json(await AB_SOURCES[src].chapters(id)); }
    catch (e) { res.status(502).json({ error: e.message, chapters: [] }); }
  });
  app.get('/api/podcast/search', async (req, res) => {
    const q = (req.query.q || '').trim(); if (!q) return res.json({ results: [] });
    try { res.json({ results: await podcasts.search(q) }); }
    catch (e) { res.status(502).json({ error: e.message, results: [] }); }
  });
  app.get('/api/podcast/episodes', async (req, res) => {
    const id = req.query.id; if (!id) return res.status(400).json({ error: 'id required', chapters: [] });
    try { res.json(await podcasts.episodes(id)); }
    catch (e) { res.status(502).json({ error: e.message, chapters: [] }); }
  });
  app.get('/api/music/search', async (req, res) => {
    const q = (req.query.q || '').trim(), src = req.query.source || 'audius';
    if (!q) return res.json({ results: [] });
    if (!MUSIC_SOURCES[src]) return res.status(400).json({ error: 'unknown source', results: [] });
    try { res.json({ results: await MUSIC_SOURCES[src].search(q) }); }
    catch (e) { res.status(502).json({ error: e.message, results: [] }); }
  });
  app.get('/api/music/stream', async (req, res) => {
    const src = req.query.source, id = req.query.id;
    if (!src || !MUSIC_SOURCES[src] || !id) return res.status(400).json({ error: 'source+id required' });
    try { const s = await MUSIC_SOURCES[src].stream(id); if (!s.url) return res.status(404).json({ error: 'no stream' }); res.json(s); }
    catch (e) { res.status(502).json({ error: e.message }); }
  });
  // Lazy cover resolver for gdstudio (NetEase pic_id -> image url), cached so re-renders don't re-hit GD.
  const gdPicCache = new Map();
  app.get('/api/music/cover', async (req, res) => {
    const src = req.query.source, id = req.query.id;
    if (src !== 'gdstudio' || !id) return res.status(404).end();
    try {
      let url = gdPicCache.get(id);
      if (!url) {
        const d = await getJson(GD + '?types=pic&source=netease&id=' + encodeURIComponent(id) + '&size=300');
        url = d && d.url; if (url) gdPicCache.set(id, url);
      }
      if (!url) return res.status(404).end();
      res.redirect((process.env.BASE_PATH || '') + '/api/proxy?url=' + encodeURIComponent(url));   // proxy = cached image
    } catch (e) { res.status(404).end(); }
  });
}
module.exports = { mountAudiobooks };
