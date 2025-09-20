// setLocationFilter.js
// Submit location filter form to set shipping destination cookie.
// Returns { ok: boolean, attempted: boolean, status?: number }
const log = require('../util/logger');

async function setLocationFilter({ client, shipsTo, tokens = {} }) {
  if (!client || !shipsTo) return { ok:false, attempted:false };
  try {
    const boundary = '----crawlerBoundary' + Date.now();
    const parts = [];
    function addField(name, value) {
      if (value == null) return;
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
    }
    addField('shipsTo', shipsTo);
    if (tokens._sourcePage) addField('_sourcePage', tokens._sourcePage);
    if (tokens.__fp) addField('__fp', tokens.__fp);
    parts.push(`--${boundary}--\r\n`);
    const body = parts.join('');
    const url = 'https://littlebiggy.net/setLocationFilter';
    const res = await client.post(url, body, { headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }, timeout: 15000, maxRedirects:0, validateStatus: s=> s>=200 && s<400 });
    const status = res.status;
    if (status >=200 && status <300) {
      log.debug(`[loc] setLocationFilter ok shipsTo=${shipsTo} status=${status}`);
      return { ok:true, attempted:true, status };
    }
    log.warn(`[loc] setLocationFilter non-2xx status=${status}`);
    return { ok:false, attempted:true, status };
  } catch (e) {
    log.warn(`[loc] setLocationFilter error: ${e.message}`);
    return { ok:false, attempted:true, error: e.message };
  }
}

module.exports = { setLocationFilter };

