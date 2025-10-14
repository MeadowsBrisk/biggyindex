const log = require('../util/logger');
const { PassThrough } = require('stream');

// Fetch raw HTML for an item page with optional byte cap.
// Args: { client, url, refNum, timeout, shipsTo, maxBytes }
// Returns { urlUsed, status, html, ms, truncated }
async function fetchItemPage({ client, url, refNum, timeout = 20000, shipsTo, maxBytes, earlyAbort=true, earlyAbortMinBytes=8192 }) {
  const hosts = ['https://littlebiggy.net', 'https://www.littlebiggy.net'];
  const candidateUrls = [];
  const addVariants = (u) => {
    if (!u) return;
    if (shipsTo && !/shipsTo=/i.test(u)) candidateUrls.push(u + (u.includes('?') ? '&' : '?') + 'shipsTo=' + encodeURIComponent(shipsTo));
    candidateUrls.push(u);
  };
  if (url) addVariants(url);
  if (refNum) {
    for (const h of hosts) addVariants(`${h}/item/${encodeURIComponent(refNum)}/view/p`);
    for (const h of hosts) addVariants(`${h}/item/${encodeURIComponent(refNum)}`);
  }
  let lastErr = null;
  for (const u of candidateUrls) {
    const t0 = Date.now();
    try {
      let html = '';
      let status = null;
      let truncated = false;
  if (maxBytes && maxBytes > 1024) {
        // Attempt streaming partial fetch
        try {
          const res = await client.get(u, { responseType:'stream', timeout });
          status = res.status;
          const stream = res.data instanceof PassThrough ? res.data : res.data; // axios returns a stream
          let received = 0;
          const chunks = [];
          let abortDetected = false;
          await new Promise((resolve, reject) => {
            stream.on('data', (chunk) => {
              if (!chunk) return;
              chunks.push(chunk);
              received += chunk.length;
              if (!abortDetected && earlyAbort && received >= earlyAbortMinBytes) {
                // quick heuristic: if we have both a foldable shipping marker and a share form token, we can stop early
                const snapshot = Buffer.concat(chunks).toString('utf8');
                const hasFoldable = /foldable\s+Bp3/i.test(snapshot);
                const hasShareToken = /name="contextRefNum"/i.test(snapshot);
                const hasExpectedRef = refNum ? new RegExp(String(refNum).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).test(snapshot) : true;
                if (hasFoldable && hasShareToken && hasExpectedRef) {
                  abortDetected = true;
                  truncated = true; // mark truncated even though early-aborted
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
          log.debug(`[itemPage] ok ref=${refNum} url=${u} ms=${ms} len=${html.length}${truncated?' (truncated)':''}`);
          return { urlUsed: u, status, html, ms, truncated, abortedEarly: abortDetected };
        } catch (se) {
          // Fallback to full text fetch
          log.debug(`[itemPage] stream fallback ref=${refNum} url=${u} err=${se.message}`);
        }
      }
      // Full fetch (no streaming or fallback)
      const res = await client.get(u, { responseType: 'text', timeout });
      status = res.status;
      html = typeof res.data === 'string' ? res.data : (res.data && res.data.toString ? res.data.toString() : '');
      const ms = Date.now() - t0;
      log.debug(`[itemPage] ok ref=${refNum} url=${u} ms=${ms} len=${html.length}`);
  return { urlUsed: u, status, html, ms, truncated:false, abortedEarly:false };
    } catch (e) {
      lastErr = e;
      const status = e?.response?.status;
      const ms = Date.now() - t0;
      log.warn(`[itemPage] fail ref=${refNum} url=${u} status=${status || e.code || 'ERR'} ms=${ms}`);
      // Continue trying others unless 404 (hard not-found) or 403
      if (status === 404 || status === 403) break;
    }
  }
  if (lastErr) throw lastErr;
  throw new Error('fetchItemPage: no candidates');
}

module.exports = { fetchItemPage };
