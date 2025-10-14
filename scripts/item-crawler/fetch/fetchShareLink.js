const { parseShareForm } = require('../parse/parseShareForm');
const { fetchItemPage } = require('./fetchItemPage');
const { writeShareDebug } = require('../persistence/outputs');
const log = require('../util/logger');

// Attempt to obtain a share/referral link via HTTP form POST (no headless).
// Uses the same working approach as seller crawler - trusts http-cookie-agent.
// opts: { client, jar, refNum, html?, outputDir?, timeout? }
// returns { link, source, error? }
async function fetchShareLink({ client, jar, refNum, html, outputDir, timeout = 20000, retry = true, redact = false } = {}) {
  if (!client || !refNum) return { link:null, source:'none', error:'missing_client_or_ref' };
  let workingHtml = html;
  try {
    if (!workingHtml) {
      const page = await fetchItemPage({ client, refNum, timeout: 15000 });
      workingHtml = page.html;
    }
  } catch (e) {
    log.warn(`[share] ref=${refNum} initial html fetch failed: ${e.message}`);
  }
  if (!workingHtml) return { link:null, source:'none', error:'no_html' };

  // NEVER use pre-rendered inline links - they may belong to another user!
  // We MUST generate fresh authenticated share links via POST to embed our referral token
  
  const form = parseShareForm(workingHtml);
  if (!form) {
    log.debug(`[share] ref=${refNum} form parse failed`);
    return { link:null, source:'none', error:'share_form_not_found' };
  }
  log.debug(`[share] ref=${refNum} form parsed contextRefNum=${form.contextRefNum} contextId=${form.contextId||'none'} hasSourcePage=${!!form._sourcePage} hasFp=${!!form.__fp}`);

  // Build multipart form (same as seller crawler)
  const boundary = '----itemShare'+Math.random().toString(16).slice(2);
  const parts = [];
  const add = (n,v)=>{ if(v!=null) parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`); };
  if (form.contextRefNum) add('contextRefNum', form.contextRefNum);
  if (form.contextId) add('contextId', form.contextId);
  if (form._sourcePage) add('_sourcePage', form._sourcePage);
  if (form.__fp) add('__fp', form.__fp);
  add('contextType', form.contextType || (form.contextId ? 'SUBJECT' : 'ITEM'));
  parts.push(`--${boundary}--\r\n`);
  const body = parts.join('');

  const headers = { 'Content-Type':`multipart/form-data; boundary=${boundary}` };
  const hosts = ['https://littlebiggy.net', 'https://www.littlebiggy.net'];
  let lastErr = null; let link = null; let status = null; let locationHeader = null;
  
  // CRITICAL: Extract cookies manually and set Cookie header explicitly
  // http-cookie-agent doesn't reliably set cookies with POST + custom headers
  let cookieHeader = '';
  if (jar) {
    try {
      const tough = require('tough-cookie');
      const cookies = await new Promise((resolve) => {
        jar.getCookies('https://littlebiggy.net/item/share', (err, cookies) => {
          resolve(err ? [] : cookies);
        });
      });
      if (cookies && cookies.length > 0) {
        cookieHeader = cookies.map(c => `${c.key}=${c.value}`).join('; ');
        log.debug(`[share] ref=${refNum} extracted ${cookies.length} cookies: ${cookies.map(c => c.key).join(',')}`);
      } else {
        log.warn(`[share] ref=${refNum} jar has 0 cookies for /item/share - link will be unauthenticated!`);
      }
    } catch (e) {
      log.warn(`[share] ref=${refNum} failed to extract cookies: ${e.message}`);
    }
  } else {
    log.warn(`[share] ref=${refNum} no jar provided - link will be unauthenticated!`);
  }
  
  // Add Cookie header if we have cookies (REQUIRED for authenticated referral links)
  if (cookieHeader) {
    headers['Cookie'] = cookieHeader;
  }
  
  for (const host of hosts) {
    const url = `${host}/item/share`;
    try {
      log.debug(`[share] ref=${refNum} POST url=${url}`);
      // Don't override headers in config - let axios merge with defaults
      const res = await client.post(url, body, { 
        headers,
        maxRedirects: 0, 
        validateStatus: s => true, 
        responseType: 'text'
      });
      status = res.status;
      locationHeader = res.headers?.location || res.headers?.Location;
      log.debug(`[share] ref=${refNum} POST status=${status} hasLocation=${!!locationHeader} location=${locationHeader||'none'}`);
      
      // Extract link in priority order (same as seller)
      const data = res.data;
      if (data && typeof data === 'object') link = data.link || link;
      if (!link && locationHeader && /\/link\//.test(locationHeader)) {
        link = locationHeader.startsWith('http') ? locationHeader : (host + locationHeader);
      }
      if (!link && typeof data === 'string') {
        const m = data.match(/https?:\/\/[^\s"']+\/link\/[A-Za-z0-9]+/);
        if (m) link = m[0];
      }
      if (link) {
        log.debug(`[share] ref=${refNum} got link from ${host}`);
        const result = { link, source: 'http' };
        if (outputDir) {
          let dbgForm = form;
          if (redact && dbgForm) {
            dbgForm = { ...dbgForm };
            for (const k of ['_sourcePage','__fp']) if (dbgForm[k]) dbgForm[k] = String(dbgForm[k]).slice(0,6)+'…'+String(dbgForm[k]).slice(-4);
          }
          try { writeShareDebug(outputDir, refNum, { refNum, status, locationHeader, form: dbgForm, hasLink: true, retry: retry?true:false }); } catch {}
        }
        return result;
      }
      // Debug: log response snippet when no link found
      if (typeof data === 'string' && data.length > 0) {
        const snippet = data.replace(/\s+/g, ' ').slice(0, 150);
        log.debug(`[share] ref=${refNum} no link from ${host} status=${status} bodySnippet="${snippet}"`);
      }
      lastErr = new Error('no_link_in_response');
    } catch (e) {
      lastErr = e;
      log.warn(`[share] ref=${refNum} post failed url=${url} status=${e?.response?.status||e.code||'ERR'} msg=${e.message}`);
    }
  }

  // Retry with fallback
  if (retry) {
    try {
      const fallbackUrl = `${hosts[0]}/item/share`;
      log.debug(`[share] ref=${refNum} retry POST url=${fallbackUrl}`);
      const res = await client.post(fallbackUrl, body, { headers, maxRedirects: 0, validateStatus: s => true, responseType: 'text' });
      status = res.status;
      locationHeader = res.headers?.location || res.headers?.Location;
      const data = res.data;
      if (data && typeof data === 'object') link = data.link || link;
      if (!link && locationHeader && /\/link\//.test(locationHeader)) {
        link = locationHeader.startsWith('http') ? locationHeader : (hosts[0] + locationHeader);
      }
      if (!link && typeof data === 'string') {
        const m = data.match(/https?:\/\/[^\s"']+\/link\/[A-Za-z0-9]+/);
        if (m) link = m[0];
      }
      if (link) {
        log.debug(`[share] ref=${refNum} got link from retry`);
        const result = { link, source: 'http-retry' };
        if (outputDir) {
          let dbgForm = form;
          if (redact && dbgForm) {
            dbgForm = { ...dbgForm };
            for (const k of ['_sourcePage','__fp']) if (dbgForm[k]) dbgForm[k] = String(dbgForm[k]).slice(0,6)+'…'+String(dbgForm[k]).slice(-4);
          }
          try { writeShareDebug(outputDir, refNum, { refNum, status, locationHeader, form: dbgForm, hasLink: true, retry: true }); } catch {}
        }
        return result;
      }
    } catch {}
  }

  // Failed to get link
  const error = lastErr?.message || 'no_link_in_response';
  if (lastErr && lastErr.response && typeof lastErr.response.data === 'string') {
    const snippet = lastErr.response.data.replace(/\s+/g,' ').slice(0, 240);
    log.warn(`[share] ref=${refNum} failed reason=${error} bodySnippet="${snippet}"`);
  } else if (lastErr) {
    log.warn(`[share] ref=${refNum} failed reason=${error}`);
  }
  
  const result = { link: null, source: 'none', error };
  if (outputDir) {
    let dbgForm = form;
    if (redact && dbgForm) {
      dbgForm = { ...dbgForm };
      for (const k of ['_sourcePage','__fp']) if (dbgForm[k]) dbgForm[k] = String(dbgForm[k]).slice(0,6)+'…'+String(dbgForm[k]).slice(-4);
    }
    try { writeShareDebug(outputDir, refNum, { refNum, status, locationHeader, form: dbgForm, error, hasLink: false, retry: retry?true:false }); } catch {}
  }
  return result;
}

module.exports = { fetchShareLink };
