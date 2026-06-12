'use strict';
const http = require('http');
const path = require('path');
const https = require('https');
const express = require('express');
const { WebSocketServer } = require('ws');
const { mountProxy }    = require('./proxy');
const { mountResolver } = require('./resolver');
const { mountManga }    = require('./manga');
const { mountBooks }    = require('./book');
const { mountAudiobooks } = require('./audiobook');

const PORT = parseInt(process.env.PORT || '4190', 10);

const app = express();
app.set('trust proxy', 1);

// --- access gate: central hl-auth (per-account). Local/on-box access bypasses; public is gated.
const { requireAccess, checkAccess } = require('./requireAccess.cjs');
app.use(requireAccess('watch-together'));

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, p) => { if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache, must-revalidate'); },
}));
mountProxy(app);
mountResolver(app);
mountManga(app);
mountBooks(app);
mountAudiobooks(app);

// --- Movie search ---
// Primary: TMDb API (set TMDB_API_KEY env var; free key at themoviedb.org — richer data, TMDb IDs)
// Fallback: IMDb suggestions API (no key required; returns IMDb IDs)
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim();
  const ALLOWED = ['tv', 'anime', 'kdrama', 'jdrama', 'cdrama'];
  const type = ALLOWED.indexOf(req.query.type) >= 0 ? req.query.type : 'movie';
  if (!q) return res.json({results: []});
  // K/J/C-drama -> TMDB TV filtered by origin country
  const DRAMA_COUNTRY = { kdrama: 'KR', jdrama: 'JP', cdrama: 'CN' };
  const DRAMA_LANG = { KR: 'ko', JP: 'ja', CN: 'zh' };

  // --- Anime search via AniList GraphQL (keyless) — returns AniList ids + episode counts ---
  if (type === 'anime') {
    const body = JSON.stringify({
      query: 'query($s:String){Page(perPage:12){media(search:$s,type:ANIME,sort:SEARCH_MATCH){id title{romaji english}coverImage{medium}episodes format seasonYear}}}',
      variables: { s: q },
    });
    const options = {
      hostname: 'graphql.anilist.co', path: '/', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const apiReq = https.request(options, (apiRes) => {
      const chunks = [];
      apiRes.on('data', c => chunks.push(c));
      apiRes.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          const media = (data.data && data.data.Page && data.data.Page.media) || [];
          const results = media.map(m => ({
            id: m.id,
            title: (m.title && (m.title.english || m.title.romaji)) || '',
            year: m.seasonYear ? String(m.seasonYear) : '',
            poster: m.coverImage ? m.coverImage.medium : null,
            episodes: m.episodes || null,
            format: m.format || '',
            type: 'anime',
            idType: 'anilist',
          }));
          res.json({results});
        } catch (e) { res.status(500).json({error: 'AniList parse error', results: []}); }
      });
    });
    apiReq.on('error', e => res.status(502).json({error: e.message, results: []}));
    apiReq.setTimeout(8000, () => { apiReq.destroy(); res.status(504).json({error: 'AniList timeout', results: []}); });
    apiReq.write(body);
    apiReq.end();
    return;
  }

  const key = process.env.TMDB_API_KEY;
  if (key) {
    // TMDb API path — returns TMDb IDs. movie -> /search/movie; tv & dramas -> /search/tv (+country filter)
    const country = DRAMA_COUNTRY[type] || null;
    const searchType = (type === 'movie') ? 'movie' : 'tv';
    const apiPath = '/3/search/' + searchType + '?api_key=' + key + '&query=' + encodeURIComponent(q) + '&include_adult=false&language=en-US&page=1';
    const options = {hostname: 'api.themoviedb.org', path: apiPath, method: 'GET', headers: {'Accept': 'application/json'}};
    const apiReq = https.request(options, (apiRes) => {
      const chunks = [];
      apiRes.on('data', c => chunks.push(c));
      apiRes.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          let items = data.results || [];
          if (country) items = items.filter(it => (it.origin_country || []).indexOf(country) >= 0 || it.original_language === DRAMA_LANG[country]);
          const results = items.slice(0, 12).map(item => ({
            id: item.id,
            title: item.title || item.name || '',
            year: (item.release_date || item.first_air_date || '').slice(0, 4),
            poster: item.poster_path ? 'https://image.tmdb.org/t/p/w185' + item.poster_path : null,
            type: searchType === 'tv' ? 'tv' : 'movie',
            idType: 'tmdb',
          }));
          res.json({results});
        } catch (e) { res.status(500).json({error: 'TMDb parse error', results: []}); }
      });
    });
    apiReq.on('error', e => res.status(502).json({error: e.message, results: []}));
    apiReq.setTimeout(8000, () => { apiReq.destroy(); res.status(504).json({error: 'TMDb timeout', results: []}); });
    apiReq.end();
  } else {
    // IMDb suggestions API fallback — no key required, returns IMDb IDs (tt-format)
    const firstChar = (q[0] || 'a').toLowerCase().replace(/[^a-z0-9]/, 'a');
    const imdbPath = '/suggestion/' + firstChar + '/' + encodeURIComponent(q) + '.json';
    const options = {
      hostname: 'v2.sg.media-imdb.com', path: imdbPath, method: 'GET',
      headers: {'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'},
    };
    const apiReq = https.request(options, (apiRes) => {
      const chunks = [];
      apiRes.on('data', c => chunks.push(c));
      apiRes.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          const TV_TYPES = new Set(['TV series', 'TV mini-series', 'TV special', 'TV movie', 'TV short']);
          const results = (data.d || [])
            .filter(item => {
              if (!item.id || !item.id.startsWith('tt')) return false;
              const isTV = TV_TYPES.has(item.q);
              if (type === 'movie' && isTV) return false;
              if (type === 'tv' && !isTV) return false;
              return true;
            })
            .slice(0, 10)
            .map(item => ({
              id: item.id,
              title: item.l || '',
              year: item.y ? String(item.y) : '',
              poster: item.i ? item.i.imageUrl : null,
              type: TV_TYPES.has(item.q) ? 'tv' : 'movie',
              idType: 'imdb',
            }));
          res.json({results});
        } catch (e) { res.status(500).json({error: 'IMDb parse error', results: []}); }
      });
    });
    apiReq.on('error', e => res.status(502).json({error: e.message, results: []}));
    apiReq.setTimeout(8000, () => { apiReq.destroy(); res.status(504).json({error: 'IMDb timeout', results: []}); });
    apiReq.end();
  }
});

app.get('*', (_req, res) => { res.setHeader('Cache-Control', 'no-cache, must-revalidate'); res.sendFile(path.join(__dirname, 'public/index.html')); });

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const rooms = new Map();

function getRoom(id) {
  if (!rooms.has(id)) {
    rooms.set(id, { status: 'PAUSED', position: 0, serverTs: Date.now(), clients: new Set() });
  }
  return rooms.get(id);
}

function snapshot(room) {
  return { status: room.status, position: room.position, serverTs: room.serverTs };
}

function broadcast(room, msg, skip) {
  const data = JSON.stringify(msg);
  for (const c of room.clients) {
    if (c !== skip && c.readyState === 1) c.send(data);
  }
}

wss.on('connection', async (ws, req) => {
  const _gate = await checkAccess(req, 'watch-together'); if (!_gate.ok) { ws.close(); return; }
  let rid = null;
  let room = null;

  const leave = () => {
    if (!room) return;
    room.clients.delete(ws);
    broadcast(room, { type: 'peers', count: room.clients.size });
    if (room.clients.size === 0) rooms.delete(rid);
    rid = null;
    room = null;
  };

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (m.type === 'join') {
      leave();
      rid = String(m.room || 'default').replace(/[^a-z0-9_-]/gi, '').slice(0, 32) || 'default';
      room = getRoom(rid);
      room.clients.add(ws);
      ws.send(JSON.stringify({ type: 'welcome', state: snapshot(room), peers: room.clients.size }));
      broadcast(room, { type: 'peers', count: room.clients.size }, ws);
      return;
    }

    if (!room) return;

    if (m.type === 'play') {
      room.status = 'PLAYING';
      room.position = +m.position || 0;
      room.serverTs = Date.now();
      broadcast(room, { type: 'sync', state: snapshot(room), peers: room.clients.size }, ws);
    } else if (m.type === 'pause') {
      room.status = 'PAUSED';
      room.position = +m.position || 0;
      room.serverTs = Date.now();
      broadcast(room, { type: 'sync', state: snapshot(room), peers: room.clients.size }, ws);
    } else if (m.type === 'seek') {
      room.position = +m.position || 0;
      room.serverTs = Date.now();
      broadcast(room, { type: 'sync', state: snapshot(room), peers: room.clients.size }, ws);
    } else if (m.type === 'reader') {
      // manga "read together": rebroadcast the chapter the sender opened to the room
      broadcast(room, { type: 'reader', state: m.state, peers: room.clients.size }, ws);
    } else if (m.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', serverTs: Date.now() }));
    }
  });

  ws.on('close', leave);
  ws.on('error', leave);
});

server.listen(PORT, '127.0.0.1', () =>
  console.log(`watch-together on 127.0.0.1:${PORT}`));
