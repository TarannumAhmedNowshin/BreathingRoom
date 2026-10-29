// Fetches a calendar's secret iCal link and passes it straight back to the Breathing Room page.
// Browsers can't read calendar links from another site directly (CORS), so this one step runs here.
// Nothing is stored or logged. Only public https addresses are allowed, and only iCal data is returned.
const dns = require('node:dns').promises;
const net = require('node:net');

const MAX_BYTES = 3 * 1024 * 1024;

function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivate(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

async function checkUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim().replace(/^webcals?:\/\//i, 'https://')); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
  const addrs = await dns.lookup(u.hostname, { all: true }).catch(() => []);
  if (!addrs.length || addrs.some((a) => isPrivate(a.address))) return null;
  return u;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  const send = (code, msg) => { res.statusCode = code; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end(msg); };

  let url = await checkUrl(req.query && req.query.url);
  if (!url) return send(400, 'That is not a calendar link. It should start with https:// or webcal://');

  try {
    let r;
    for (let hops = 0; hops < 4; hops++) {
      r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'BreathingRoom/1.0' } });
      if (r.status < 300 || r.status >= 400) break;
      url = await checkUrl(new URL(r.headers.get('location') || '', url));
      if (!url) return send(400, 'The calendar link redirected somewhere it should not.');
    }
    if (!r.ok) return send(502, `The calendar answered with an error (${r.status}). Check the link is the secret iCal address.`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) return send(413, 'That calendar is too large to read.');
    const text = buf.toString('utf8');
    if (!/^\s*BEGIN:VCALENDAR/.test(text.replace(/^﻿/, ''))) return send(422, "That link doesn't return a calendar. Use the iCal (.ics) address.");
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    return res.end(text);
  } catch (e) {
    return send(504, "Couldn't reach the calendar. Try again in a minute.");
  }
};
