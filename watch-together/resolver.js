"use strict";
const { chromium } = require("playwright");
const { execFile } = require("child_process");
const { URL } = require("url");
const net = require("net");
const { assertPublicHost } = require("./safeUrl");
const discovery = require("./discovery");

// --- yt-dlp path ---
function tryYtDlp(pageUrl){return new Promise((resolve)=>{execFile("yt-dlp",["-j","--no-playlist","--quiet",pageUrl],{timeout:35000,maxBuffer:10*1024*1024},(err,stdout)=>{if(err||!(stdout||"").trim()){resolve({found:false,reason:"yt-dlp:"+(err?err.message:"no output")});return;}let info;try{info=JSON.parse(stdout.trim().split("\n")[0]);}catch{resolve({found:false,reason:"yt-dlp JSON parse failed"});return;}if(info.hls_manifest_url){resolve({found:true,source:"ytdlp",streams:[{type:"manifest",streamUrl:info.hls_manifest_url,contentType:"application/x-mpegurl"}]});return;}const muxed=(info.formats||[]).filter(f=>f.url&&f.vcodec&&f.vcodec!=="none"&&f.acodec&&f.acodec!=="none").sort((a,b)=>(b.height||0)-(a.height||0));if(muxed.length>0){resolve({found:true,source:"ytdlp",streams:[{type:"segment",streamUrl:muxed[0].url,contentType:"video/mp4"}]});return;}if(info.url){const isM=/\.(m3u8|mpd)(\?|$)/i.test(info.url)||(()=>{try{return new URL(info.url).hostname.startsWith("manifest.");}catch{return false;}})();resolve({found:true,source:"ytdlp",streams:[{type:isM?"manifest":"segment",streamUrl:info.url,contentType:null}]});return;}resolve({found:false,reason:"no usable format"});});})}

// --- stream classification ---
const MANIFEST_URL_RE=/\.(m3u8|mpd)(\?|$)/i;
const MANIFEST_CT=new Set(["application/x-mpegurl","application/vnd.apple.mpegurl","audio/mpegurl","application/dash+xml"]);
const SEGMENT_URL_RE=/\.(mp4|webm|ts|m4s)(\?|$)/i;
const SEGMENT_CT=new Set(["video/mp4","video/webm","video/mp2t"]);
function isSameOriginAsset(r,p){try{return new URL(r).hostname===new URL(p).hostname;}catch{return false;}}
function classify(url,ct){const c=(ct||"").split(";")[0].trim().toLowerCase();if(c==="text/html"||c==="text/plain"||c==="application/json")return null;if(MANIFEST_CT.has(c))return"manifest";if(SEGMENT_CT.has(c))return"segment";if(MANIFEST_URL_RE.test(url))return"manifest";if(SEGMENT_URL_RE.test(url))return"segment";return null;}
function buildHit(resp,type){const rh=resp.request().headers();return{found:true,type,streamUrl:resp.url(),contentType:(resp.headers()["content-type"]||"").split(";")[0].trim(),requestHeaders:{referer:rh["referer"]||null,cookie:rh["cookie"]||null,userAgent:rh["user-agent"]||null,origin:rh["origin"]||null}};}
function dedupeStreams(arr){const seen=new Set();return arr.filter(s=>{if(seen.has(s.streamUrl))return false;seen.add(s.streamUrl);return true;});}

// --- Tor SOCKS5 proxy ---
const TOR_SOCKS = "socks5://127.0.0.1:9050";
const TOR_CONTROL_PORT = 9051;
let torAvailable = false;

function checkTorAvailable() {
  return new Promise((resolve) => {
    const sock = net.connect(9050, "127.0.0.1");
    sock.setTimeout(1500);
    sock.on("connect", () => { sock.destroy(); resolve(true); });
    sock.on("error", () => resolve(false));
    sock.on("timeout", () => { sock.destroy(); resolve(false); });
  });
}

function rotateTorCircuit() {
  if (!torAvailable) return Promise.resolve();
  return new Promise((resolve) => {
    const sock = net.connect(TOR_CONTROL_PORT, "127.0.0.1");
    sock.setTimeout(2000);
    sock.on("connect", () => { sock.write('AUTHENTICATE ""\r\nSIGNAL NEWNYM\r\nQUIT\r\n'); });
    sock.on("data", () => {});
    sock.on("close", resolve);
    sock.on("error", resolve);
    sock.on("timeout", () => { sock.destroy(); resolve(); });
  });
}

checkTorAvailable().then((ok) => {
  torAvailable = ok;
  console.log("[resolver] Tor: " + (ok ? "available — IP rotation enabled" : "not running — direct connections"));
});

// --- bot detection helpers ---
async function dismissConsent(page){for(const s of['button[id*="accept" i]','button[class*="accept" i]','button[id*="agree" i]','#onetrust-accept-btn-handler','.fc-cta-consent']){try{const el=await page.$(s);if(el&&await el.isVisible()){await el.click({timeout:1500});return;}}catch{}}}

// Search every frame (main + iframes) for a play button.
// Falls back to clicking center of subframes for non-standard players.
async function tryClickPlay(page) {
  const PLAY_SELECTORS = [
    "button:has-text('Play')","button:has-text('Watch')",
    '[aria-label*="play" i]:not([aria-label*="replay" i])',
    '[data-testid*="play"]','.play-button','#play','.play-btn','.btn-play',
    '.jw-icon-playback','.vjs-big-play-button','.vjs-play-button',
    '.plyr__play-btn','.fluid_initial_play_button',
    '[class*="PlayButton"]','button[class*="play" i]'
  ];
  const frames = page.frames();

  // 2embed.skin specific: click a source button (FlixHQ/HDToday) to trigger the actual player
  for (const frame of frames) {
    try {
      const src = await frame.$('a:has-text("FlixHQ"), a:has-text("HDToday"), a:has-text("Fmovies")');
      if (src && await src.isVisible()) { await src.click({timeout:2000}); await frame.waitForTimeout(3000); break; }
    } catch {}
  }

  for (const frame of frames) {
    for (const s of PLAY_SELECTORS) {
      try { const el=await frame.$(s); if(el&&await el.isVisible()){await el.click({timeout:2000});return true;} } catch {}
    }
  }
  // Center-click every subframe — catches overlay/custom players
  for (const frame of frames) {
    if (frame === page.mainFrame()) continue;
    try {
      await frame.evaluate(() => {
        const el = document.querySelector('video,[class*="player"],[id*="player"],[class*="overlay"],body');
        if (el) el.click();
      });
    } catch {}
  }
  try { await page.mouse.click(640, 360); } catch {}
  return false;
}

// --- core Playwright resolver ---
const DEFAULT_TIMEOUT_MS = 40000;
const POOL_TIMEOUT_MS = 20000;  // 20s per source; Tor adds ~5-10s but still fits

// useTor: true = route through Tor (avoid rate limits), false = direct (needed when Tor is blocked by CDN)
async function resolveWithPlaywright(pageUrl, timeoutMs, useTor) {
  const TIMEOUT_MS = timeoutMs || DEFAULT_TIMEOUT_MS;
  const shouldUseTor = (useTor !== false) && torAvailable;

  if (!torAvailable && useTor !== false) {
    torAvailable = await checkTorAvailable();
  }

  const launchArgs = [
    "--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu",
    "--autoplay-policy=no-user-gesture-required","--disable-blink-features=AutomationControlled"
  ];
  if (shouldUseTor) launchArgs.push("--proxy-server=" + TOR_SOCKS);

  const browser = await chromium.launch({headless:true, args:launchArgs});
  try {
    const ctx = await browser.newContext({userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",viewport:{width:1280,height:720},locale:"en-US",timezoneId:"America/New_York"});
    await ctx.addInitScript(()=>{
      Object.defineProperty(navigator,"webdriver",{get:()=>undefined});
      if(!window.chrome)window.chrome={runtime:{},loadTimes:()=>{},csi:()=>{}};
      Object.defineProperty(navigator,"plugins",{get:()=>[1,2,3,4,5]});
      const _owOpen=window.open;
      window.open=function(url,target){if((!url||url==="")&&(!target||target==="_self"))return window;return _owOpen.apply(this,arguments);};
    });
    await ctx.route("**/_next/**/_app*.js",async route=>{try{const resp=await route.fetch();let body=await resp.text();if(body.includes("ondevtoolopen")){body=body.replace(/detectors:\[[\d,]+\]/g,"detectors:[]").replace(/ondevtoolopen:[a-z$_A-Z]+,/g,"ondevtoolopen:function(){},");}await route.fulfill({response:resp,body});}catch{await route.continue();}});
    const page = await ctx.newPage();
    page.on("popup", async p => { try { await p.close(); } catch {} });
    const manifests = []; let segmentFallback = null;
    return await new Promise((resolve) => {
      let done=false, graceTimer=null;
      const finish=(r)=>{if(!done){done=true;clearTimeout(graceTimer);clearTimeout(timer);resolve(r);}};
      const timer=setTimeout(()=>{if(manifests.length>0)finish({found:true,source:"playwright",streams:dedupeStreams(manifests)});else if(segmentFallback)finish({found:true,source:"playwright",streams:[segmentFallback]});else finish({found:false,reason:"timeout"});},TIMEOUT_MS);
      page.on("response",async(resp)=>{
        if(done)return;
        const st=resp.status();if(st<200||st>=400)return;
        const url=resp.url(),ct=resp.headers()["content-type"]||"";
        const kind=classify(url,ct);
        if(kind==="manifest"){
          console.log("[playwright] manifest: "+url.slice(0,80));
          manifests.push(buildHit(resp,"manifest"));
          clearTimeout(graceTimer);graceTimer=setTimeout(()=>{finish({found:true,source:"playwright",streams:dedupeStreams(manifests)});},5000);
        } else if(kind==="segment"&&!segmentFallback){
          if(isSameOriginAsset(url,pageUrl))return;
          console.log("[playwright] segment fallback: "+url.slice(0,80));
          segmentFallback=buildHit(resp,"segment");
        } else if(!kind&&(ct.includes("javascript")||ct.includes("json"))){
          // Scan JS/JSON response bodies for embedded m3u8 URLs
          try{
            const body=await resp.text();
            const m=body.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/g);
            if(m){m.forEach(function(mu){if(!manifests.some(function(x){return x.streamUrl===mu;})){console.log("[playwright] m3u8 in JS: "+mu.slice(0,80));manifests.push({found:true,type:"manifest",streamUrl:mu,contentType:"application/x-mpegurl",requestHeaders:{referer:null,cookie:null,userAgent:null,origin:null}});clearTimeout(graceTimer);graceTimer=setTimeout(()=>{finish({found:true,source:"playwright",streams:dedupeStreams(manifests)});},3000);}});}
          }catch{}
        }
      });
      page.goto(pageUrl,{waitUntil:"domcontentloaded",timeout:TIMEOUT_MS}).catch(()=>{});
      (async()=>{
        try{await dismissConsent(page);}catch{}
        try{await page.waitForSelector("button:has-text('Play'),button:has-text('Watch')",{timeout:Math.min(TIMEOUT_MS-5000,18000)});}catch{}
        // Wait for iframes to settle before trying to click
        try{await page.waitForTimeout(2000);}catch{}
        if(!done)try{await tryClickPlay(page);}catch{}
      })();
    });
  } finally { await browser.close().catch(()=>{}); }
}

// --- trailer detection ---
const IMDB_TRAILER_HOST="imdb-video.media-imdb.com";
const TRAILER_VIDEASY_HOST="trailers.videasy.to";
function isOnlyTrailer(streams){return streams.length>0&&streams.every(function(s){try{const h=new URL(s.streamUrl).hostname;return h===IMDB_TRAILER_HOST||h===TRAILER_VIDEASY_HOST;}catch{return false;}});}

// --- ID extraction ---
// TMDb: cineby.at/movie/ID, vidsrc.to/embed/movie/ID, tmdb:ID, tmdb:movie:ID
function extractTmdbId(raw) {
  const s = String(raw).trim();
  const sh = s.match(/^tmdb:(?:movie:)?(\d+)$/i);
  if (sh) return sh[1];
  try {
    const m = new URL(s).pathname.match(/\/(?:(?:embed\/)?movie|film)\/(\d+)/);
    return m ? m[1] : null;
  } catch { return null; }
}

// IMDb: imdb:tt0137523 shorthand, or imdb.com/title/tt0137523
function extractImdbId(raw) {
  const s = String(raw).trim();
  const sh = s.match(/^imdb:(tt\d+)$/i);
  if (sh) return sh[1];
  try {
    const parsed = new URL(s);
    if (parsed.hostname.includes("imdb.com")) {
      const m = parsed.pathname.match(/\/title\/(tt\d+)/);
      return m ? m[1] : null;
    }
  } catch {}
  return null;
}

// anime:<anilistId>[:<episode>][:<sub|dub>]  e.g. anime:16498:1:sub  (ep defaults 1, lang defaults sub)
function extractAnimeId(raw) {
  const m = String(raw).trim().match(/^anime:(\d+)(?::(\d+))?(?::(sub|dub))?$/i);
  if (!m) return null;
  return { anilist: m[1], ep: m[2] || "1", lang: (m[3] || "sub").toLowerCase() };
}

// tv:<tmdbId>:<season>:<episode>  e.g. tv:93405:1:1  (TV shows + K/J/C-dramas)
function extractTvId(raw) {
  const m = String(raw).trim().match(/^tv:(\d+):(\d+):(\d+)$/i);
  if (!m) return null;
  return { tmdb: m[1], s: m[2], e: m[3] };
}

// --- source pools ---
// Each entry: { fn(id) => url, tor: bool }
// tor:true  → route via Tor (avoids CDN rate limits, e.g. videasy.to behind cineby.at)
// tor:false → direct connection (needed when Tor exit nodes are CDN-blocked)

// --- source pools ---
// Audited 2026-06: batch-tested ~50 providers; most are dead (DNS fail) or Cloudflare-blocked.
// Only entries that captured a real .m3u8 in the Playwright tester are kept — dead entries waste time.
//
// Dead (DNS/SSL): embed.su, moviesapi.club, smashy.stream, autoembed.cc, vidsrc.xyz, vidsrc.vip,
//   vidsrc.net, vidsrc.icu, rive.watch, moviee.tv, hexa.watch, flixembed.net, warezcdn,
//   moviewp.com, vidcloud.stream, gomo.to
// Cloudflare BotMgmt (invisible page): vidsrc.to, vidsrc.cc (v2/v3), himovies.sx, theflixer.tv
// No stream captured (player needs deeper interaction — revisit): vidfast.pro, vidjoy.pro,
//   111movies.com, nontongo.win, vidsrc.su, vidsrc.rip, fsapi.xyz, curtstream.com, apimdb.net, superembed,
//   vidzee (player.vidzee.wtf), vidplus.to, icefy.top, vembed.click, spencerdevs.xyz
// DECOY (matched .m3u8/.mp4 in tester but body is fake — DO NOT add): cine.su (returns literal "not found"
//   for every title), vidrock.net/.ru (serves /demo-video.mp4, 32KB placeholder)
// Added 2026-06 round: moviesapi.to (netrocdn.site/hd4u.sbs), vidnest.fun (auroriondigital.shop)

const MOVIE_EMBED_SOURCES = [
  // Confirmed working — 7 DISTINCT CDNs, so a single CDN outage can't take us down
  { fn: id => `https://vixsrc.to/movie/${id}`,                 tor: false }, // CDN: vixsrc.to — CLEAN direct HLS, no token-proxy, no Tor — most robust
  { fn: id => `https://vidlink.pro/movie/${id}`,               tor: false }, // CDN: storm.vodvidl.site — JWPlayer, autoplays
  { fn: id => `https://moviesapi.to/movie/${id}`,              tor: false }, // CDN: netrocdn.site / hd4u.sbs / clarvista.shop / mirevana.online (rotates) — real 1080p HLS master, ref vidora.stream — added 2026-06
  { fn: id => `https://www.cineby.at/movie/${id}`,             tor: true  }, // CDN: mooncarpet.site via videasy.to; Tor bypasses throttle
  { fn: id => `https://player.videasy.net/movie/${id}`,        tor: true  }, // CDN: mooncarpet.site — videasy direct entry; Tor (IP-throttled)
  { fn: id => `https://vidsrc.wtf/api/2/movie/?id=${id}`,      tor: false }, // CDN: keymi417exx.com
  { fn: id => `https://iframe.pstream.org/embed/tmdb-movie-${id}`, tor: false }, // CDN: vcmdiawe.com — MP4 segments
  { fn: id => `https://vidnest.fun/movie/${id}`,               tor: false }, // CDN: auroriondigital.shop / clarvista.shop / mirevana.online (rotates) — real multi-audio HLS; some titles serve decoy, low priority — added 2026-06
  // Alive, attempted — 2embed.skin needs source-button click (FlixHQ/HDToday); tryClickPlay handles it
  { fn: id => `https://2embed.skin/movie/${id}`,               tor: false },
  // Alive, Cloudflare Turnstile challenge — sometimes passes
  { fn: id => `https://multiembed.mov/?video_id=${id}&tmdb=1`, tor: false },
];

// IMDb-ID-compatible providers (accept tt-format IDs natively)
const IMDB_EMBED_SOURCES = [
  { fn: id => `https://vixsrc.to/movie/${id}`,                 tor: false }, // accepts IMDb IDs too, clean HLS
  { fn: id => `https://vidlink.pro/movie/${id}`,               tor: false }, // confirmed working with imdb: ids
  { fn: id => `https://www.cineby.at/movie/${id}`,             tor: true  }, // accepts IMDb IDs, Tor to avoid videasy.to throttle
  { fn: id => `https://2embed.skin/movie/${id}`,               tor: false },
];

// DEDICATED anime sources — keyed by AniList id + episode + sub/dub. Audited 2026-06.
// Only dedicated anime providers (NOT TMDB-TV endpoints of movie CDNs). 3 distinct CDNs.
// fn(anilistId, episode, lang) => embed url.   The 2026 piracy collapse (HiAnime/AnimeKai
// shut down) killed most classics; these 3 are the reliable survivors.
// tor:true on all — these throttle our single VPS IP under user load, so the resolve step
// rotates Tor exit IPs between batches. Verified Tor exits are NOT blocked by these CDNs
// (see deploy test); if a CDN ever blocks Tor, flip that entry to tor:false.
// Ordered cleanest-segments-first. vidnest's megacloud segments 403 our proxy (anti-leech),
// so it's LAST — kept only as a thumbnail/last-resort. 4animo is self-hosted (segments proxy
// cleanly) so it leads. Anime returns ALL sources (see tryAnimePool) so the picker has choices.
// Ordered most-playable-first (verified segment fetch through our proxy on fresh tokens):
// miruro + vidnest segments PLAY when fresh; 4animo's segments 403, so it's last (fallback only).
const ANIME_EMBED_SOURCES = [
  { fn: (id, ep, lang) => `https://www.miruro.tv/watch?id=${id}&ep=${ep}`,            tor: true }, // ultracloud.cc — segments play
  { fn: (id, ep, lang) => `https://vidnest.fun/anime/${id}/${ep}/${lang}`,            tor: true }, // megacloud.animanga.fun — segments play fresh
  { fn: (id, ep, lang) => `https://cdn.4animo.xyz/embed/ani/${id}/${ep}/${lang}?k=1`, tor: true }, // cdn.4animo.xyz — segments often 403, fallback
];

// TV shows + K/J/C-dramas — TMDB-id /tv/ endpoints. fn(tmdbId, season, episode). Audited 2026-06:
// only vidlink + videasy serve correct, segment-playable TV (vixsrc/tv serves WRONG titles; vidsrc-family dead).
const TV_EMBED_SOURCES = [
  { fn: (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}`,        tor: false }, // storm.vodvidl.site — segment-verified
  { fn: (id, s, e) => `https://player.videasy.net/tv/${id}/${s}/${e}`, tor: true  }, // server.digitalsun.app — IP-throttled, Tor
];

const POOL_CONCURRENCY = 2;

function raceFirstGood(items) {
  return new Promise(function(resolve) {
    var settled = false, pending = items.length;
    function onDone() { pending--; if(pending<=0&&!settled) resolve(null); }
    items.forEach(function(item) {
      resolveWithPlaywright(item.url, POOL_TIMEOUT_MS, item.tor).then(function(r) {
        if(!settled && r.found && r.streams.length>0 && !isOnlyTrailer(r.streams)){
          settled=true;
          resolve(Object.assign({}, r, {source:"playwright-pool"}));
        }
        onDone();
      }).catch(function(e){
        console.log("[resolver] pool error: "+item.url.slice(0,55)+" -- "+e.message);
        onDone();
      });
    });
  });
}

async function runPool(items) {
  const total = items.length;
  for (var i = 0; i < total; i += POOL_CONCURRENCY) {
    const batch = items.slice(i, i + POOL_CONCURRENCY);
    const batchNum = Math.floor(i/POOL_CONCURRENCY)+1;
    const totalBatches = Math.ceil(total/POOL_CONCURRENCY);
    if (i > 0) await rotateTorCircuit();
    const label = batch.map(function(it){
      const host = it.url.split("/").slice(2,3).join("");
      return (it.tor?"[T]":"[D]")+host;
    }).join(", ");
    console.log("[resolver] batch "+batchNum+"/"+totalBatches+": "+label);
    const result = await raceFirstGood(batch);
    if (result) { console.log("[resolver] found stream in batch "+batchNum); return result; }
    console.log("[resolver] batch "+batchNum+" no stream");
  }
  return {found:false, reason:"all "+total+" sources exhausted"};
}

// single-arg sources (movies/imdb): fn(id) => url. For movies we ALSO append any auto-discovered
// promoted sources from the dynamic engine (the static seeds always run first, in order — so
// behavior for existing sources is unchanged; discovery only ADDS redundancy on top).
function trySourcePool(id, sources, category) {
  var items;
  if (category) {
    // drop static seeds the engine has confirmed DEAD (tombstoned) — saves the ~20s timeout each.
    items = sources.filter(function(s){ try { return discovery.isAlive("video", category, s.fn("${id}")); } catch (e) { return true; } })
                   .map(function(s){ return {url: s.fn(id), tor: s.tor}; });
    if (!items.length) items = sources.map(function(s){ return {url: s.fn(id), tor: s.tor}; });  // fallback: never serve an empty pool
    try {
      var have = {}; items.forEach(function(it){ have[it.url] = 1; });
      discovery.rankedFor("video", category).forEach(function(r){
        if (r.evidence === "seed") return;                    // append only auto-DISCOVERED ones
        var u = discovery.buildUrl(r.template, id);
        if (!have[u]) { items.push({url: u, tor: r.tor}); have[u] = 1; }
      });
    } catch (e) {}
  } else {
    items = sources.map(function(s){ return {url: s.fn(id), tor: s.tor}; });
  }
  return runPool(items);
}
// Collect streams from EVERY source (in concurrency-capped batches), tagged by provider host,
// with a referer attached for segment fetching. Used for anime so the picker shows alternatives
// (one provider's segments may 403 while another's play).
async function runPoolCollect(items) {
  let streams = [];
  for (var i = 0; i < items.length; i += POOL_CONCURRENCY) {
    const batch = items.slice(i, i + POOL_CONCURRENCY);
    if (i > 0) await rotateTorCircuit();
    const label = batch.map(function(it){ return (it.tor?"[T]":"[D]")+it.url.split("/").slice(2,3).join(""); }).join(", ");
    console.log("[resolver] collect batch: " + label);
    const rs = await Promise.all(batch.map(function(it){
      return resolveWithPlaywright(it.url, POOL_TIMEOUT_MS, it.tor).then(function(r){ return {it, r}; }).catch(function(){ return null; });
    }));
    for (const x of rs) {
      if (!x || !x.r || !x.r.found || !x.r.streams || !x.r.streams.length || isOnlyTrailer(x.r.streams)) continue;
      let host = "", ref = "";
      try { const u = new URL(x.it.url); host = u.hostname; ref = u.origin + "/"; } catch {}
      x.r.streams.forEach(function(s){
        if (!s.requestHeaders) s.requestHeaders = {};
        if (!s.requestHeaders.referer) s.requestHeaders.referer = ref;  // JS-scraped streams have none
        s.provider = host;
        streams.push(s);
      });
    }
  }
  if (streams.length) return { found: true, source: "playwright-pool", streams };
  return { found: false, reason: "all " + items.length + " sources exhausted" };
}
// anime sources: fn(anilistId, episode, lang) => url. Collect ALL so the user can pick a working one.
function tryAnimePool(a) {
  return runPoolCollect(ANIME_EMBED_SOURCES.map(function(s){ return {url: s.fn(a.anilist, a.ep, a.lang), tor: s.tor}; }));
}
// tv sources: fn(tmdbId, season, episode) => url. Collect ALL (only 2 sources; one may lack a title).
function tryTvPool(t) {
  return runPoolCollect(TV_EMBED_SOURCES.map(function(s){ return {url: s.fn(t.tmdb, t.s, t.e), tor: s.tor}; }));
}

// --- main resolver ---
const YTDLP_HOSTS=new Set(["youtube.com","youtu.be","vimeo.com","twitch.tv","dailymotion.com","twitter.com","x.com","tiktok.com","instagram.com","facebook.com","fb.watch"]);
function isYtDlpHost(pageUrl){try{const h=new URL(pageUrl).hostname.replace(/^www\./,"");return YTDLP_HOSTS.has(h)||h.endsWith(".youtube.com");}catch{return false;}}

async function resolveStream(pageUrl) {
  if (isYtDlpHost(pageUrl)) {
    const r = await tryYtDlp(pageUrl);
    if (r.found) return r;
  }
  const tmdbId = extractTmdbId(pageUrl);
  if (tmdbId) {
    console.log("[resolver] tmdb:"+tmdbId+" from "+pageUrl.slice(0,55)+", "+MOVIE_EMBED_SOURCES.length+" sources");
    return trySourcePool(tmdbId, MOVIE_EMBED_SOURCES, "movie");
  }
  const imdbId = extractImdbId(pageUrl);
  if (imdbId) {
    console.log("[resolver] imdb:"+imdbId+" from "+pageUrl.slice(0,55)+", "+IMDB_EMBED_SOURCES.length+" sources");
    return trySourcePool(imdbId, IMDB_EMBED_SOURCES);
  }
  const animeId = extractAnimeId(pageUrl);
  if (animeId) {
    console.log("[resolver] anime:"+animeId.anilist+" ep"+animeId.ep+" "+animeId.lang+", "+ANIME_EMBED_SOURCES.length+" sources");
    return tryAnimePool(animeId);
  }
  const tvId = extractTvId(pageUrl);
  if (tvId) {
    console.log("[resolver] tv:"+tvId.tmdb+" S"+tvId.s+"E"+tvId.e+", "+TV_EMBED_SOURCES.length+" sources");
    return tryTvPool(tvId);
  }
  console.log("[resolver] direct playwright: "+pageUrl.slice(0,60));
  return resolveWithPlaywright(pageUrl);
}

// --- cache + HTTP handler ---
let resolving = false;
const resolveCache = new Map();
const CACHE_TTL = 4 * 60 * 60 * 1000;        // 4h — movie HLS tokens are valid for hours
const ANIME_CACHE_TTL = 8 * 60 * 1000;       // 8min — anime (megacloud/ultracloud) tokens expire fast; stale cache = "never plays"
const TV_CACHE_TTL = 30 * 60 * 1000;         // 30min — TV/drama tokens (videasy digitalsun) expire faster than movies
function ttlFor(key) { return /^anime:/.test(key) ? ANIME_CACHE_TTL : /^tv:/.test(key) ? TV_CACHE_TTL : CACHE_TTL; }

function mountResolver(app) {
  // --- Dynamic Source Engine: seed from the static pools, run background discovery, expose status.
  // Wrapped in try/catch so an engine fault can NEVER break /api/resolve (the static path stands alone).
  try {
    var feeds = null; try { feeds = require("./discovery_feeds"); } catch (e) { console.log("[discovery] feeds not present yet: " + e.message); }
    discovery.init({
      dataDir: process.env.DISCOVERY_DATA_DIR || "/app/data",
      proxyBase: "http://127.0.0.1:" + (process.env.PORT || 4190),
      basePath: process.env.BASE_PATH || "",
      resolveWithPlaywright: resolveWithPlaywright,
      feeds: feeds,
      isBusy: function(){ return resolving; },               // pause heavy probes during user resolves
    });
    discovery.seed("video", "movie", MOVIE_EMBED_SOURCES.map(function(s){ return { template: s.fn("${id}"), tor: s.tor }; }));
    discovery.seed("video", "tv", TV_EMBED_SOURCES.map(function(s){ return { template: s.fn("${id}", "${s}", "${e}"), tor: s.tor }; }));
    discovery.seed("video", "anime", ANIME_EMBED_SOURCES.map(function(s){ return { template: s.fn("${id}", "${ep}", "${lang}"), tor: s.tor }; }));
    discovery.seedReadingAudio();                            // health-track the reading/audio adapters too
    if (process.env.DISCOVERY_DISABLE !== "1") discovery.start();
    app.get("/api/discovery/status", function(_req, res){ try { res.json(discovery.getStatus()); } catch (e) { res.status(500).json({ error: e.message }); } });
    console.log("[discovery] engine mounted (" + (feeds ? "feeds live" : "feeds pending") + ")");
  } catch (e) { console.log("[discovery] mount skipped: " + e.message); }

  app.get("/api/resolve", async (req, res) => {
    const raw = req.query.url;
    if (!raw) return res.status(400).json({error:"Missing ?url= parameter"});

    const isTmdbShort = /^tmdb:/i.test(String(raw).trim());
    const isImdbShort = /^imdb:/i.test(String(raw).trim());
    const isAnimeShort = /^anime:/i.test(String(raw).trim());
    const isTvShort = /^tv:/i.test(String(raw).trim());
    if (!isTmdbShort && !isImdbShort && !isAnimeShort && !isTvShort) {
      let parsed;
      try { parsed = new URL(raw); } catch { return res.status(400).json({error:"Malformed URL"}); }
      if (parsed.protocol!=="http:"&&parsed.protocol!=="https:") return res.status(400).json({error:"Only http/https allowed"});
      // SSRF guard: a raw URL goes to headless Chromium (page.goto) and yt-dlp — neither can use
      // a guarded socket lookup, so reject any host that resolves to a private/loopback address.
      try { await assertPublicHost(parsed.hostname); }
      catch { return res.status(400).json({ error: "Blocked: that host is not allowed." }); }
    }

    const tmdbId = extractTmdbId(raw);
    const imdbId = extractImdbId(raw);
    const animeId = extractAnimeId(raw);
    const tvId = extractTvId(raw);
    const cacheKey = tmdbId ? "tmdb:"+tmdbId : imdbId ? "imdb:"+imdbId
      : animeId ? "anime:"+animeId.anilist+":"+animeId.ep+":"+animeId.lang
      : tvId ? "tv:"+tvId.tmdb+":"+tvId.s+":"+tvId.e : raw;

    const cached = resolveCache.get(cacheKey);
    if (cached && (Date.now()-cached.ts) < ttlFor(cacheKey)) {
      return res.json({found:true, source:cached.result.source||"playwright", streams:cached.result.streams, cached:true});
    }

    if (resolving) return res.status(429).json({error:"A resolution is already in progress - try again shortly."});
    resolving = true;
    try {
      const result = await resolveStream(raw);
      if (!result.found) return res.status(404).json({error:"No media stream found", reason:result.reason});
      resolveCache.set(cacheKey, {result, ts:Date.now()});
      return res.json({found:true, source:result.source||"playwright", streams:result.streams});
    } catch(err) {
      return res.status(500).json({error:"Resolver failed", detail:err.message});
    } finally {
      resolving = false;
    }
  });
}

module.exports = {resolveStream, mountResolver, extractTmdbId, extractImdbId, extractAnimeId, extractTvId};
