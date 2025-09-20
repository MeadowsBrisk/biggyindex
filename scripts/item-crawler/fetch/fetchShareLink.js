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

  // Direct pre-rendered link check
  const direct = workingHtml.match(/https?:\/\/littlebiggy\.net\/link\/[A-Za-z0-9-_]+/);
  if (direct) return { link: direct[0], source:'html-inline' };

  const form = parseShareForm(workingHtml);
  if (!form) return { link:null, source:'none', error:'share_form_not_found' };

  // Build multipart form
  const boundary = '----shareBoundary'+Date.now();
  const parts = [];
  const add = (n,v)=>{ if(v!=null) parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`); };
  add('contextRefNum', form.contextRefNum);
  add('contextType', form.contextType||'ITEM');
  if (form._sourcePage) add('_sourcePage', form._sourcePage);
  if (form.__fp) add('__fp', form.__fp);
  parts.push(`--${boundary}--\r\n`);
  const body = parts.join('');

  let res = null; let status = null; let link = null; let error=null; let bodySnippet=null; let locationHeader=null;
  async function attempt(postAttempt){
    try {
      const r = await client.post('https://littlebiggy.net/item/share', body, {
        headers:{ 'Content-Type':`multipart/form-data; boundary=${boundary}` },
        timeout,
        maxRedirects:0,
        validateStatus:(c)=> c>=200 && c<400
      });
      return r;
    } catch (e) { throw e; }
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
