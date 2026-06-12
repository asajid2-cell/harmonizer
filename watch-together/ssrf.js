'use strict';
// SSRF-hardened fetch for the discovery engine. Auto-discovered URLs are attacker-influenceable
// (a poisoned provider-JS or GitHub repo could inject an internal/link-local URL), so every
// discovery/validation fetch goes through here: DNS-pinned validation (re-validated at connect via
// the `lookup` hook, defeating DNS-rebinding), private/reserved ranges blocked, redirects + body
// size + timeout capped. (Tandem: this layer was Codex's catch — the manual workflow had no SSRF guard.)
const https = require('https');
const http = require('http');
const dns = require('dns');
const net = require('net');
const { URL } = require('url');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function ipToLong(ip) { return ip.split('.').reduce((a, o) => ((a << 8) + (parseInt(o, 10) & 255)) >>> 0, 0) >>> 0; }
function inCidr(ip, base, bits) { const m = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0; return (ipToLong(ip) & m) === (ipToLong(base) & m); }
function isPrivateV4(ip) {
  return inCidr(ip, '0.0.0.0', 8) || inCidr(ip, '10.0.0.0', 8) || inCidr(ip, '100.64.0.0', 10) ||
    inCidr(ip, '127.0.0.0', 8) || inCidr(ip, '169.254.0.0', 16) || inCidr(ip, '172.16.0.0', 12) ||
    inCidr(ip, '192.0.0.0', 24) || inCidr(ip, '192.0.2.0', 24) || inCidr(ip, '192.168.0.0', 16) ||
    inCidr(ip, '198.18.0.0', 15) || inCidr(ip, '198.51.100.0', 24) || inCidr(ip, '203.0.113.0', 24) ||
    inCidr(ip, '224.0.0.0', 4) || inCidr(ip, '240.0.0.0', 4) || ip === '255.255.255.255';
}
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return isPrivateV4(ip);
  if (net.isIPv6(ip)) {
    const lo = ip.toLowerCase().replace(/^\[|\]$/g, '');
    if (lo === '::1' || lo === '::') return true;
    if (/^fe[89ab]/.test(lo)) return true;                 // fe80::/10 link-local
    if (/^f[cd]/.test(lo)) return true;                    // fc00::/7 unique-local
    const m = lo.match(/(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/); // ::ffff: mapped v4
    if (m) return isPrivateV4(m[1]);
    if (lo === '::ffff:0:0' || lo.startsWith('64:ff9b')) return true;
    return false;
  }
  return true; // unknown family → reject
}
function isLoopback(ip) {
  if (net.isIPv4(ip)) return inCidr(ip, '127.0.0.0', 8);
  const lo = String(ip).toLowerCase();
  return lo === '::1' || /(?:::ffff:)127\./.test(lo);
}
// DNS hook factory: resolves, drops private addrs (pinned at connect → defeats rebinding). When
// allowLoopback is set, the loopback range is permitted — used ONLY for the engine's trusted calls
// to its OWN app (127.0.0.1:4190); external feed/media fetches use the default (loopback blocked).
function makeSafeLookup(allowLoopback) {
  const blocked = ip => isPrivateIp(ip) && !(allowLoopback && isLoopback(ip));
  return function (hostname, options, cb) {
    if (typeof options === 'function') { cb = options; options = {}; }
    const wantAll = !!(options && options.all);            // node 20's agent calls with all:true (Happy-Eyeballs)
    if (net.isIP(hostname)) {
      if (blocked(hostname)) return cb(new Error('blocked: private literal IP'));
      const fam = net.isIPv6(hostname) ? 6 : 4;
      return wantAll ? cb(null, [{ address: hostname, family: fam }]) : cb(null, hostname, fam);
    }
    dns.lookup(hostname, { all: true }, (err, addrs) => {
      if (err) return cb(err);
      const ok = (addrs || []).filter(a => !blocked(a.address));
      if (!ok.length) return cb(new Error('blocked: ' + hostname + ' resolves only to private/reserved'));
      if (wantAll) return cb(null, ok);
      cb(null, ok[0].address, ok[0].family);
    });
  };
}

function safeFetch(url, opts) {
  opts = opts || {};
  const headers = opts.headers || {}, timeoutMs = opts.timeoutMs || 8000,
    maxBytes = opts.maxBytes || 8 * 1024 * 1024, maxRedirects = opts.maxRedirects == null ? 4 : opts.maxRedirects,
    method = opts.method || 'GET';
  return new Promise((resolve, reject) => {
    let u; try { u = new URL(url); } catch (e) { return reject(new Error('bad url')); }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return reject(new Error('blocked protocol ' + u.protocol));
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: (u.pathname || '/') + (u.search || ''), method, lookup: makeSafeLookup(!!opts.allowLoopback),
      headers: Object.assign({ 'User-Agent': UA, 'Accept': '*/*' }, headers),
    }, r => {
      if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location && maxRedirects > 0) {
        r.resume();
        let next; try { next = new URL(r.headers.location, url).href; } catch (e) { return reject(new Error('bad redirect')); }
        return safeFetch(next, Object.assign({}, opts, { maxRedirects: maxRedirects - 1 })).then(resolve, reject);
      }
      const chunks = []; let len = 0;
      r.on('data', c => { len += c.length; if (len > maxBytes) req.destroy(new Error('response too large')); else chunks.push(c); });
      r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, body: Buffer.concat(chunks).toString('utf8'), finalUrl: url }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.end();
  });
}
function safeJson(url, opts) { return safeFetch(url, opts).then(r => JSON.parse(r.body)); }

module.exports = { safeFetch, safeJson, isPrivateIp };
