const log = require('../../item-crawler/util/logger');
const { PassThrough } = require('stream');

// Fetch raw HTML for a seller page with optional byte cap and early-abort.
// Args: { client, url, sellerId, timeout, maxBytes, earlyAbort=true, earlyAbortMinBytes=8192 }
// Returns { urlUsed, status, html, ms, truncated, abortedEarly }
async function fetchSellerPage({ client, url, sellerId, timeout = 20000, maxBytes, earlyAbort = true, earlyAbortMinBytes = 8192 }) {
  const hosts = ['https://littlebiggy.net', 'https://www.littlebiggy.net'];
  const candidateUrls = [];
  const addVariants = (u) => {
    if (!u) return;
    candidateUrls.push(u);
    try {
      const alt = u.replace('https://www.', 'https://').replace('https://', 'https://www.');
      if (alt !== u) candidateUrls.push(alt);
    } catch {}
  };
  if (url) addVariants(url);
  if (sellerId) {
    for (const h of hosts) addVariants(`${h}/viewSubject/p/${encodeURIComponent(sellerId)}`);
  }
  let lastErr = null;
  for (const u of candidateUrls) {
    const t0 = Date.now();
    try {
      let html = '';
      let status = null;
      let truncated = false;
      let abortedEarly = false;
      if (maxBytes && maxBytes > 1024) {
        try {
          const res = await client.get(u, { responseType: 'stream', timeout });
          status = res.status;
          const stream = res.data instanceof PassThrough ? res.data : res.data;
          let received = 0;
          const chunks = [];
          await new Promise((resolve, reject) => {
            stream.on('data', (chunk) => {
              if (!chunk) return;
              chunks.push(chunk);
              received += chunk.length;
              if (!abortedEarly && earlyAbort && received >= earlyAbortMinBytes) {
                const snapshot = Buffer.concat(chunks).toString('utf8');
                // Early-abort heuristic: manifesto marker and share token present (contextRefNum or contextId or shareForm)
                if (/manifesto/i.test(snapshot) && (/(name="contextRefNum"|name="contextId"|class="shareForm")/i.test(snapshot))) {
                  abortedEarly = true;
                  truncated = true;
                  stream.destroy();
                }
              }
              if (received >= maxBytes) {
                truncated = true;
                stream.destroy();
              }
            });
            stream.on('error', reject);
            stream.on('close', resolve);
            stream.on('end', resolve);
          });
          html = Buffer.concat(chunks, Math.min(received, maxBytes)).toString('utf8');
          const ms = Date.now() - t0;
          log.debug(`[sellerPage] ok id=${sellerId} url=${u} ms=${ms} len=${html.length}${truncated ? ' (truncated)' : ''}`);
          return { urlUsed: u, status, html, ms, truncated, abortedEarly };
        } catch (se) {
          log.debug(`[sellerPage] stream fallback id=${sellerId} url=${u} err=${se.message}`);
        }
      }
      const res = await client.get(u, { responseType: 'text', timeout });
      status = res.status;
      html = typeof res.data === 'string' ? res.data : (res.data && res.data.toString ? res.data.toString() : '');
      const ms = Date.now() - t0;
      log.debug(`[sellerPage] ok id=${sellerId} url=${u} ms=${ms} len=${html.length}`);
      return { urlUsed: u, status, html, ms, truncated: false, abortedEarly: false };
    } catch (e) {
      lastErr = e;
      const status = e?.response?.status;
      const ms = Date.now() - t0;
      log.warn(`[sellerPage] fail id=${sellerId} url=${u} status=${status || e.code || 'ERR'} ms=${ms}`);
      if (status === 404 || status === 403) break;
    }
  }
  if (lastErr) throw lastErr;
  throw new Error('fetchSellerPage: no candidates');
}

module.exports = { fetchSellerPage };


