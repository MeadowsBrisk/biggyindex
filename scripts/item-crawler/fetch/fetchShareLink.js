const { parseShareForm } = require('../parse/parseShareForm');
const { fetchItemPage } = require('./fetchItemPage');
const { writeShareDebug } = require('../persistence/outputs');
const log = require('../util/logger');

// Attempt to obtain a share/referral link via HTTP form POST (no headless).
// opts: { client, refNum, html?, outputDir?, timeout? }
// returns { link, source, error? }
async function fetchShareLink({ client, refNum, html, outputDir, timeout = 20000, retry = true, redact = false } = {}) {
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

  // Prefer the share form for this specific ref, and scope inline link detection to that form's HTML
  let form = parseShareForm(workingHtml, refNum);
  let inlineScope = form?.scopeHtml || workingHtml;
  function detectInlineLink(scopeHtml, fallbackHtml) {
    if (!scopeHtml) return null;
    // Absolute link first (with or without www)
    const abs = scopeHtml.match(/https?:\/\/(?:www\.)?littlebiggy\.net\/link\/([A-Za-z0-9-_]+)/);
    if (abs) return abs[0];
    // Relative link in href
    const relHref = scopeHtml.match(/href=["'](\/link\/([A-Za-z0-9-_]+))["']/i);
    if (relHref) {
      // Choose host based on presence of www in the larger HTML
      const prefersWww = /https?:\/\/www\.littlebiggy\.net\//.test(fallbackHtml||scopeHtml);
      const base = prefersWww ? 'https://www.littlebiggy.net' : 'https://littlebiggy.net';
      return base + relHref[1];
    }
    // As a last chance, a bare relative path
    const rel = scopeHtml.match(/(^|[^A-Za-z0-9])\/(link\/([A-Za-z0-9-_]+))/);
    if (rel) {
      const prefersWww = /https?:\/\/www\.littlebiggy\.net\//.test(fallbackHtml||scopeHtml);
      const base = prefersWww ? 'https://www.littlebiggy.net' : 'https://littlebiggy.net';
      return base + '/' + rel[2];
    }
    return null;
  }
  // Direct pre-rendered link check within the form scope
  let inlineLink = detectInlineLink(inlineScope, workingHtml);
  if (!inlineLink) {
    // Fallback: some pages render the link outside the form; check whole HTML
    inlineLink = detectInlineLink(workingHtml, workingHtml);
  }
  if (!inlineLink) {
    // If still not found, fetch full page (disable earlyAbort) to search again
    try {
      const page = await fetchItemPage({ client, refNum, timeout: 20000, earlyAbort: false });
      if (page && page.html) {
        workingHtml = page.html;
        form = parseShareForm(workingHtml, refNum);
        inlineScope = form?.scopeHtml || workingHtml;
        inlineLink = detectInlineLink(inlineScope, workingHtml) || detectInlineLink(workingHtml, workingHtml);
      }
    } catch (e) { /* ignore and continue to HTTP form */ }
  }
  if (inlineLink) return { link: inlineLink, source:'html-inline' };

    // If no form, or the found form doesn't match this ref, try a full, non-truncated fetch and re-parse
    if (!form || (form.contextRefNum && String(form.contextRefNum) !== String(refNum))) {
      try {
        const page = await fetchItemPage({ client, refNum, timeout: 20000, earlyAbort: false });
        if (page && page.html) {
          workingHtml = page.html;
          form = parseShareForm(workingHtml, refNum);
          inlineScope = form?.scopeHtml || workingHtml;
          direct = inlineScope.match(/https?:\/\/littlebiggy\.net\/link\/[A-Za-z0-9-_]+/);
          if (direct) return { link: direct[0], source:'html-inline' };
        }
      } catch (e) {
        // proceed to HTTP form attempt below (may still work if tokens are present)
      }
    }

    if (!form) {
      // As a last resort, attempt minimal POST with just contextRefNum/contextType
      const boundary2 = '----shareBoundary'+(Date.now()+1);
      const parts2 = [];
      const add2 = (n,v)=>{ if(v!=null) parts2.push(`--${boundary2}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`); };
      add2('contextRefNum', refNum);
      add2('contextType', 'ITEM');
      parts2.push(`--${boundary2}--\r\n`);
      const body2 = parts2.join('');
      try {
        const hosts = ['https://littlebiggy.net','https://www.littlebiggy.net'];
        for (const host of hosts) {
          try {
            const r = await client.post(host + '/item/share', body2, {
              headers:{
                'Content-Type':`multipart/form-data; boundary=${boundary2}`,
                'Origin': host,
                'Referer': `${host}/item/${encodeURIComponent(refNum)}/view/p`
              },
              timeout,
              maxRedirects:0,
              validateStatus:(c)=> c>=200 && c<400
            });
            let link = null;
            const locationHeader = r.headers?.location || r.headers?.Location;
            if (locationHeader && /\/link\//.test(locationHeader)) {
              link = locationHeader.startsWith('http') ? locationHeader : host + locationHeader;
            }
            const text = typeof r.data === 'string' ? r.data : (r.data ? JSON.stringify(r.data) : '');
            if (!link) {
              const m = (text||'').match(/https?:\/\/(?:www\.)?littlebiggy\.net\/link\/[A-Za-z0-9-_]+/);
              if (m) link = m[0];
            }
            if (link) return { link, source:'http' };
          } catch {}
        }
      } catch {}
      return { link:null, source:'none', error:'share_form_not_found' };
    }

  // Build multipart form
  const boundary = '----shareBoundary'+Date.now();
  const parts = [];
  const add = (n,v)=>{ if(v!=null) parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`); };
  // include all parsed hidden fields first
  if (form.fields && typeof form.fields === 'object') {
    for (const [k,v] of Object.entries(form.fields)) add(k,v);
  }
  // ensure core fields present / corrected
  add('contextRefNum', form.contextRefNum);
  add('contextId', form.contextId);
  add('contextType', form.contextType||'ITEM');
  if (form._sourcePage) add('_sourcePage', form._sourcePage);
  if (form.__fp) add('__fp', form.__fp);
  parts.push(`--${boundary}--\r\n`);
  const body = parts.join('');

  let res = null; let status = null; let link = null; let error=null; let bodySnippet=null; let locationHeader=null;
  async function attempt(postAttempt){
    const hosts = ['https://littlebiggy.net','https://www.littlebiggy.net'];
    let lastErr = null;
    for (const host of hosts) {
      try {
        const r = await client.post(host + '/item/share', body, {
          headers:{
            'Content-Type':`multipart/form-data; boundary=${boundary}`,
            'Origin': host,
            'Referer': `${host}/item/${encodeURIComponent(refNum)}/view/p`
          },
          timeout,
          maxRedirects:0,
          validateStatus:(c)=> c>=200 && c<400
        });
        return r;
      } catch (e) { lastErr = e; /* try next host */ }
    }
    if (lastErr) throw lastErr;
    throw new Error('share_post_failed');
  }
  let attemptErr = null;
  for (let a=1; a<= (retry?2:1); a++) {
    try {
      res = await attempt(a);
      status = res.status;
      locationHeader = res.headers?.location || res.headers?.Location;
      let text = '';
      if (typeof res.data === 'string') text = res.data; else if (res.data && typeof res.data === 'object') {
        if (res.data.link && /\/link\//.test(res.data.link)) link = res.data.link;
        try { text = JSON.stringify(res.data); } catch {}
      }
      bodySnippet = text.slice(0,800);
      if (!link && locationHeader && /\/link\//.test(locationHeader)) {
        link = locationHeader.startsWith('http') ? locationHeader : 'https://littlebiggy.net'+locationHeader;
      }
      if (!link) {
        const m = text.match(/https?:\/\/littlebiggy\.net\/link\/[A-Za-z0-9-_]+/);
        if (m) link = m[0];
      }
      if (!link) error='no_link_in_response'; else error=null;
      if (link || !retry) break; // success or no retry path
    } catch (e) {
      attemptErr = e;
      if (a === (retry?2:1)) error = e.message || 'share_post_failed';
    }
    if (!link && retry && a===1) {
      await new Promise(r=>setTimeout(r, 500));
    }
  }

  const result = { link: link||null, source: link? 'http':'none' };
  if (error) result.error = error;
  if (outputDir) {
    let dbgForm = form;
    if (redact && dbgForm) {
      dbgForm = { ...dbgForm };
      for (const k of ['_sourcePage','__fp']) if (dbgForm[k]) dbgForm[k] = String(dbgForm[k]).slice(0,6)+'…'+String(dbgForm[k]).slice(-4);
    }
    try { writeShareDebug(outputDir, refNum, { refNum, status, locationHeader, form: dbgForm, error, hasLink: !!link, bodySnippet, retry: retry?true:false }); } catch {}
  }
  if (!link && error) log.debug(`[share] ref=${refNum} http attempt failed: ${error}`);
  return result;
}

module.exports = { fetchShareLink };
