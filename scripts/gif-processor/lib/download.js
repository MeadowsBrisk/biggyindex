const { setTimeout: delay } = require('timers/promises');

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { redirect: 'follow', signal: controller.signal });
  } finally { clearTimeout(t); }
}

async function headSize(url, timeoutMs) {
  try {
    const r = await fetchWithTimeout(url, timeoutMs);
    const len = r.headers.get('content-length');
    return len ? Number(len) : null;
  } catch { return null; }
}

async function download(url, maxBytes, timeoutMs, retries) {
  for (let a=0; a<=retries; a++) {
    try {
      const r = await fetchWithTimeout(url, timeoutMs);
      if (!r.ok) throw new Error('HTTP '+r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > maxBytes) return { error:'size-limit' };
      return { buffer: buf };
    } catch (e) {
      if (a === retries) return { error: e.name === 'AbortError' ? 'timeout' : (e.message || 'download-failed') };
      await delay(150 * (a+1));
    }
  }
  return { error:'unknown' };
}

module.exports = { headSize, download };
