// HTTP client factory for crawler (no dynamic ESM; use http-cookie-agent directly)
const axios = require('axios');
const { HttpCookieAgent, HttpsCookieAgent } = require('http-cookie-agent/http');

async function createHttpClient({ jar, timeout = 30000 }) {
  const client = axios.create({
    // Attach cookie-aware agents so axios keeps the tough-cookie jar in sync
    httpAgent: new HttpCookieAgent({ cookies: { jar } }),
    httpsAgent: new HttpsCookieAgent({ cookies: { jar } }),
    withCredentials: true,
    timeout,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      'Accept-Language': 'en-GB,en;q=0.9',
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://littlebiggy.net/',
      'Origin': 'https://littlebiggy.net'
    },
    // Only treat 2xx as success; caller handles errors
    validateStatus: (code) => code >= 200 && code < 300
  });
  return client;
}

module.exports = { createHttpClient };
