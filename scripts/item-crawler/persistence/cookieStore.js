const fs = require('fs');
const path = require('path');
const { CookieJar } = require('tough-cookie');

// cookieStore.js - persist tough-cookie jar between runs so we retain lf/location + session cookies.
// Public API:
//  loadCookieJar(filePath) -> Promise<CookieJar>
//  saveCookieJar(filePath, jar) -> Promise<boolean>
//  listCookies(jar, url) -> Promise<Array<{key,value,domain,path}>> (values NOT truncated; caller may truncate)

async function loadCookieJar(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return new CookieJar();
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return await new Promise((resolve, reject) => {
      CookieJar.deserialize(raw, (err, jar) => {
        if (err) return reject(err);
        resolve(jar);
      });
    });
  } catch (e) {
    // On any failure return a fresh jar (do not crash crawl)
    return new CookieJar();
  }
}

async function saveCookieJar(filePath, jar) {
  try {
    if (!filePath || !jar) return false;
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const serialized = await new Promise((resolve, reject) => {
      jar.serialize((err, json) => err ? reject(err) : resolve(json));
    });
    fs.writeFileSync(filePath, JSON.stringify(serialized, null, 2), 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

async function listCookies(jar, url = 'https://littlebiggy.net/') {
  if (!jar) return [];
  return await new Promise((resolve) => {
    try {
      jar.getCookies(url, (err, cookies) => {
        if (err || !cookies) return resolve([]);
        resolve(cookies.map(c => ({ key: c.key, value: c.value, domain: c.domain, path: c.path })));
      });
    } catch {
      resolve([]);
    }
  });
}

module.exports = { loadCookieJar, saveCookieJar, listCookies };
