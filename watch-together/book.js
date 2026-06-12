'use strict';
// Book sources — search returns [{source,id,title,author,cover,ext}]; file(id) resolves the
// actual EPUB/PDF download URL + referer. The frontend loads it via /api/proxy into epub.js
// (reader) and the Save button downloads it locally.
const https = require('https');
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
function dec(s) { return String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/<[^>]+>/g, '').trim(); }

// ---- LibGen (copyrighted + public-domain EPUBs) ----
const LG_HOSTS = ['https://libgen.li', 'https://libgen.bz', 'https://libgen.vg'];
async function lgSearch(q) {
  let body = '', host = LG_HOSTS[0];
  for (const h of LG_HOSTS) {
    try { const r = await httpGet(h + '/index.php?req=' + encodeURIComponent(q) + '&objects%5B%5D=f'); if (r.status === 200 && /ads\.php\?md5=/.test(r.body)) { body = r.body; host = h; break; } } catch (e) {}
  }
  if (!body) return [];
  const out = [], seen = new Set();
  for (const row of body.split('<tr').slice(1)) {
    if (!/<td>epub<\/td>/i.test(row)) continue;                 // EPUB rows only (epub.js)
    const md5 = (row.match(/ads\.php\?md5=([a-fA-F0-9]{32})/) || [])[1];
    if (!md5 || seen.has(md5)) continue;
    // the tooltip title attr holds "<br>Author - Title" (markup of the title cell itself varies)
    var at = dec((row.match(/<br>([^"<]+?)"/) || [])[1] || '');
    var title = 'Untitled', author = '';
    if (at) { var i = at.indexOf(' - '); if (i > 0) { author = at.slice(0, i); title = at.slice(i + 3); } else { title = at; } }
    seen.add(md5);
    out.push({ source: 'libgen', id: md5, title: title, author: author.replace(/,\s*$/, ''), cover: null, ext: 'epub' });
    if (out.length >= 15) break;
  }
  return out;
}
async function lgFile(md5) {
  for (const host of LG_HOSTS) {
    try {
      const ads = await httpGet(host + '/ads.php?md5=' + md5, { Referer: host + '/' });
      const link = (ads.body.match(/get\.php\?md5=[a-fA-F0-9]{32}&key=[A-Za-z0-9]+/) || [])[0];
      if (link) return { url: host + '/' + link, referer: host + '/ads.php?md5=' + md5, ext: 'epub' };
    } catch (e) {}
  }
  return null;
}

// ---- Anna's Archive (broad search; downloads via the libgen md5 chain) ----
const AA = 'https://annas-archive.gl';
async function aaSearch(q) {
  const r = await httpGet(AA + '/search?q=' + encodeURIComponent(q) + '&ext=epub', { Referer: AA + '/' });
  const body = r.body.replace(/<!--/g, ' ').replace(/-->/g, ' ');   // AA hides results in HTML comments; reveal them
  const out = [], seen = new Set();
  const re = /href="\/md5\/([a-f0-9]{32})"([\s\S]{0,1400}?)(?=href="\/md5\/|<\/div><\/div><\/div>|$)/g; let m;
  while ((m = re.exec(body)) && out.length < 15) {
    const md5 = m[1], block = m[2];
    if (seen.has(md5)) continue; seen.add(md5);
    const cover = (block.match(/src="(https:\/\/[^"]*cover[^"]+)"/i) || [])[1] || null;
    const title = dec((block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/) || block.match(/font-bold[^>]*>([^<]{3,160})</) || [])[1] || 'Untitled');
    const author = dec((block.match(/italic[^>]*>([^<]{2,120})</) || [])[1] || '');
    out.push({ source: 'annas', id: md5, title: title, author: author, cover: cover, ext: 'epub' });
  }
  return out;
}

// ---- Standard Ebooks (clean public-domain EPUBs) ----
const SE = 'https://standardebooks.org';
async function seSearch(q) {
  const r = await httpGet(SE + '/ebooks?query=' + encodeURIComponent(q));
  const out = [], seen = new Set();
  const re = /href="(\/ebooks\/([a-z0-9-]+)\/([a-z0-9-]+))"/gi; let m;
  while ((m = re.exec(r.body)) && out.length < 15) {
    const slug = m[2] + '/' + m[3];
    if (seen.has(slug)) continue; seen.add(slug);
    out.push({ source: 'standardebooks', id: slug, title: m[3].replace(/-/g, ' '), author: m[2].replace(/-/g, ' '),
      cover: SE + '/images/covers/' + m[2] + '_' + m[3] + '-cover.jpg', ext: 'epub' });
  }
  return out;
}
async function seFile(slug) {
  const fn = slug.replace('/', '_');
  return { url: SE + '/ebooks/' + slug + '/downloads/' + fn + '.epub?source=download', referer: SE + '/ebooks/' + slug, ext: 'epub' };
}

// ---- Open Library / Internet Archive (public-domain + covers/metadata) ----
const OL = 'https://openlibrary.org';
async function olSearch(q) {
  const d = await getJson(OL + '/search.json?q=' + encodeURIComponent(q) + '&fields=title,author_name,cover_i,ia,ebook_access&limit=20');
  const out = [];
  (d.docs || []).forEach(x => {
    if (x.ebook_access !== 'public' || !x.ia || !x.ia.length) return;
    out.push({ source: 'openlibrary', id: x.ia[0], title: x.title || 'Untitled', author: (x.author_name || [])[0] || '',
      cover: x.cover_i ? ('https://covers.openlibrary.org/b/id/' + x.cover_i + '-M.jpg') : null, ext: 'epub' });
  });
  return out.slice(0, 15);
}
async function olFile(ia) {
  const meta = await getJson('https://archive.org/metadata/' + ia);
  const files = meta.files || [];
  const epub = files.find(f => /\.epub$/i.test(f.name));
  const pdf = files.find(f => /\.pdf$/i.test(f.name) && !/_text\.pdf$/i.test(f.name));
  const f = epub || pdf;
  if (!f) return null;
  return { url: 'https://archive.org/download/' + ia + '/' + encodeURIComponent(f.name), referer: 'https://archive.org/', ext: epub ? 'epub' : 'pdf' };
}

const BOOK_SOURCES = {
  libgen: { search: lgSearch, file: lgFile },
  annas: { search: aaSearch, file: lgFile },          // Anna's md5 -> libgen download chain
  standardebooks: { search: seSearch, file: seFile },
  openlibrary: { search: olSearch, file: olFile },
};

function mountBooks(app) {
  app.get('/api/book/search', async (req, res) => {
    const q = (req.query.q || '').trim(), src = req.query.source || 'libgen';
    if (!q) return res.json({ results: [] });
    if (!BOOK_SOURCES[src]) return res.status(400).json({ error: 'unknown source', results: [] });
    try { res.json({ results: await BOOK_SOURCES[src].search(q) }); }
    catch (e) { res.status(502).json({ error: e.message, results: [] }); }
  });
  app.get('/api/book/file', async (req, res) => {
    const src = req.query.source, id = req.query.id;
    if (!src || !BOOK_SOURCES[src] || !id) return res.status(400).json({ error: 'source+id required' });
    try { const f = await BOOK_SOURCES[src].file(id); if (!f) return res.status(404).json({ error: 'no downloadable file (not on libgen)' }); res.json(f); }
    catch (e) { res.status(502).json({ error: e.message }); }
  });
}
module.exports = { mountBooks };
