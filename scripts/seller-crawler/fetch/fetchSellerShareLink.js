const log = require('../../item-crawler/util/logger');
const { parseShareForm } = require('../../item-crawler/parse/parseShareForm');

// Attempt to generate a seller share link using existing share form parser.
// Args: { client, html, sellerRef, retry, redact }
// Returns { link, source } where source in: 'cached'|'http'|'http-retry'|'none'
async function fetchSellerShareLink({ client, html, sellerRef, retry = true, redact = false }) {
  try {
    const tokens = parseShareForm(html || '');
    if (!tokens || (!tokens.contextRefNum && !tokens.contextId)) {
      log.warn('[seller-share] missing required tokens (contextRefNum/contextId)');
      return { link: null, source: 'none' };
    }
    // Respect form action if present
    let action = null;
    try {
      const formMatch = (html||'').match(/<form[^>]*class=["'][^"']*shareForm[^"']*["'][^>]*action=["']([^"']+)["'][^>]*>/i);
      if (formMatch) action = formMatch[1];
    } catch {}
    // Build multipart form body deterministically (reusing item flow semantics)
    const boundary = '----sellerShare' + Math.random().toString(16).slice(2);
    const formParts = [];
    const add = (name, value) => {
      formParts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
    };
    if (tokens.contextRefNum) add('contextRefNum', tokens.contextRefNum);
    if (tokens.contextId) add('contextId', tokens.contextId);
    if (tokens._sourcePage) add('_sourcePage', tokens._sourcePage);
    if (tokens.__fp) add('__fp', tokens.__fp);
    add('contextType', tokens.contextType || (tokens.contextId ? 'SUBJECT' : 'ITEM'));
    formParts.push(`--${boundary}--\r\n`);
    const body = formParts.join('');
    const headers = { 'Content-Type': `multipart/form-data; boundary=${boundary}` };

    const hosts = ['https://littlebiggy.net', 'https://www.littlebiggy.net'];
    let lastErr = null;
    for (const host of hosts) {
      const url = action ? (action.startsWith('http') ? action : (host + action)) : `${host}/item/share`;
      try {
        const res = await client.post(url, body, { headers, maxRedirects: 0, validateStatus: s => true, responseType: 'text' });
        // Extract link in priority order
        let link = null;
        const data = res.data;
        if (data && typeof data === 'object') link = data.link || link;
        if (!link && res.headers && res.headers.location && /\/link\//.test(res.headers.location)) link = res.headers.location;
        if (!link && typeof data === 'string') {
          const m = data.match(/https?:\/\/[^\s"']+\/link\/[A-Za-z0-9]+/);
          if (m) link = m[0];
        }
        if (link) return { link, source: 'http' };
        lastErr = new Error('no_link_in_response');
      } catch (e) {
        lastErr = e;
        log.warn(`[seller-share] post failed url=${url} status=${e?.response?.status||e.code||'ERR'} msg=${e.message}`);
      }
    }
    if (retry) {
      try {
        const fallbackUrl = action && !action.startsWith('http') ? (hosts[0] + action) : (hosts[0] + '/item/share');
        const res = await client.post(fallbackUrl, body, { headers, maxRedirects: 0, validateStatus: s => true, responseType: 'text' });
        let link = null;
        const data = res.data;
        if (data && typeof data === 'object') link = data.link || link;
        if (!link && res.headers && res.headers.location && /\/link\//.test(res.headers.location)) link = res.headers.location;
        if (!link && typeof data === 'string') {
          const m = data.match(/https?:\/\/[^\s"']+\/link\/[A-Za-z0-9]+/);
          if (m) link = m[0];
        }
        if (link) return { link, source: 'http-retry' };
      } catch {}
    }
    if (lastErr && lastErr.response && typeof lastErr.response.data === 'string') {
      const snippet = lastErr.response.data.replace(/\s+/g,' ').slice(0, 240);
      log.warn(`[seller-share] failed reason=${lastErr.message} bodySnippet="${snippet}"`);
    } else if (lastErr) {
      log.warn(`[seller-share] failed reason=${lastErr.message}`);
    } else {
      // no_link_in_response case
      try { const snippet = (typeof data === 'string') ? data.replace(/\s+/g,' ').slice(0,240) : ''; if (snippet) log.warn(`[seller-share] no_link_in_response bodySnippet="${snippet}"`); } catch {}
    }
    return { link: null, source: 'none' };
  } catch (e) {
    log.debug('[seller-share] failed ' + e.message);
    return { link: null, source: 'none' };
  }
}

module.exports = { fetchSellerShareLink };


