const { CookieJar } = require('tough-cookie');
const { createHttpClient } = require('../fetch/httpClient');
const log = require('../util/logger');

/**
 * Login to site with retries and host fallback.
 * @param {Object} opts
 * @param {string} opts.username
 * @param {string} opts.password
 * @param {number} [opts.timeout=45000] per-attempt axios timeout (ms)
 * @param {number} [opts.maxAttempts=3] retry attempts (each tries both hosts)
 * @param {CookieJar} [opts.jar] optional pre-loaded cookie jar
 * @returns {Promise<{client: import('axios').AxiosInstance, jar: CookieJar, cookies: string[]}>}
 */
async function login({ username, password, timeout = 45000, maxAttempts = 3, jar: providedJar }) {
  if (!username || !password) throw new Error('login: missing credentials');
  const hosts = ['https://littlebiggy.net', 'https://www.littlebiggy.net'];
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    for (const host of hosts) {
      const jar = providedJar || new CookieJar();
      let client;
      try {
        client = await createHttpClient({ jar, timeout });
        // Warm-up GET to seed any required cookies (ignore errors silently)
        try { await client.get(host + '/', { responseType: 'text', timeout: Math.min(timeout - 5000, 15000) }); } catch {}
        const url = host + '/core/api/auth/login';
        log.info(`[auth] attempt=${attempt}/${maxAttempts} host=${host}`);
        const res = await client.post(url, { username, password }, { headers: { 'Content-Type': 'application/json' } });
        const setCookies = res.headers['set-cookie'] || [];
        const hasJwt = setCookies.some(c => /^JWT_USER=/.test(c));
        if (!hasJwt) {
          log.warn('[auth] Response lacked JWT_USER cookie; treating as failure');
          throw new Error('missing JWT_USER cookie');
        }
        return { client, jar, cookies: setCookies };
      } catch (e) {
        lastErr = e;
        const status = e?.response?.status;
        const isTimeout = e?.code === 'ECONNABORTED';
        log.warn(`[auth] failed attempt=${attempt} host=${host} status=${status || e.code || 'ERR'}${isTimeout ? ' (timeout)' : ''}`);
        if (status === 401 || status === 403) throw new Error(`Auth failed status=${status}`);
      }
    }
    if (attempt < maxAttempts) {
      const backoff = 1200 * attempt + Math.floor(Math.random()*400);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  throw lastErr || new Error('Login failed after retries');
}

module.exports = { login };
