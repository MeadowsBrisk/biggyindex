const fs = require('fs');
const path = require('path');
const log = require('../util/logger');
let persistence = null; // injected externally when blob mode enabled

function setPersistence(p){ persistence = p; }

function ensureDir(p){ if(!fs.existsSync(p)) fs.mkdirSync(p,{recursive:true}); }

function writePerItem(outputDir, itemData){
  try {
    if (persistence && persistence.mode === 'blobs') {
      log.debug(`[blob] write item ${itemData.refNum}`);
      persistence.writeItem(itemData);
    } else {
      const itemsDir = path.join(outputDir,'items');
      ensureDir(itemsDir);
      const file = path.join(itemsDir, `${itemData.refNum || itemData.id}.json`);
      fs.writeFileSync(file, JSON.stringify(itemData,null,2),'utf8');
    }
  } catch(e){ log.warn(`writePerItem failed ${e.message}`); }
}

function writeShareLinks(outputDir, map){
  try {
    if (persistence && persistence.mode === 'blobs') {
      (async () => {
        try {
          const existing = await persistence.readJson('share-links.json');
          const merged = { ...(existing||{}), ...(map||{}) };
          await persistence.writeJson('share-links.json', merged);
        } catch (e) {
          // Fallback: best-effort write of current map
          try { await persistence.writeJson('share-links.json', map||{}); } catch {}
        }
      })();
    } else {
      ensureDir(outputDir);
      const file = path.join(outputDir,'share-links.json');
      let existing = {};
      try { if (fs.existsSync(file)) existing = JSON.parse(fs.readFileSync(file,'utf8')); } catch {}
      const merged = { ...(existing||{}), ...(map||{}) };
      fs.writeFileSync(file, JSON.stringify(merged,null,2),'utf8');
    }
  }
  catch(e){ log.warn(`writeShareLinks failed ${e.message}`); }
}

function writeRunMeta(outputDir, meta){
  try {
    if (persistence && persistence.mode === 'blobs') {
      persistence.writeJson('run-meta.json', meta);
    } else {
      ensureDir(outputDir); fs.writeFileSync(path.join(outputDir,'run-meta.json'), JSON.stringify(meta,null,2),'utf8');
    }
  }
  catch(e){ log.warn(`writeRunMeta failed ${e.message}`); }
}

function writeShippingDebug(outputDir, refNum, fullHtml, shippingParsed){
  try {
    if (persistence && persistence.mode === 'blobs') {
      // Skip FS debug writes in blobs mode (Netlify functions have read-only FS). TODO: route to blobs if needed.
      return;
    }
    const dbgDir = path.join(outputDir,'debug','shipping');
    ensureDir(dbgDir);
    const base = path.join(dbgDir, refNum.replace(/[^A-Za-z0-9_-]/g,'_'));
    if (fullHtml) fs.writeFileSync(base + '.html', fullHtml, 'utf8');
    if (shippingParsed && typeof shippingParsed.raw === 'string') fs.writeFileSync(base + '.snippet.html', shippingParsed.raw || '', 'utf8');
  } catch (e) {
    log.warn(`[debug] writeShippingDebug failed ref=${refNum} ${e.message}`);
  }
}

function writeLfHtml(outputDir, refNum, stage, html){ //debug dump of last-fetched HTML
  try {
    if(!html) return;
    if (persistence && persistence.mode === 'blobs') {
      // Skip FS debug writes in blobs mode
      return;
    }
    const dir = path.join(outputDir,'debug','lf-html');
    ensureDir(dir);
    const safeRef = (refNum||'unknown').replace(/[^A-Za-z0-9_-]/g,'_');
    const file = path.join(dir, `${safeRef}_${stage||'page'}.html`);
    fs.writeFileSync(file, html, 'utf8');
  } catch(e){ log.warn(`[debug] writeLfHtml failed ref=${refNum} ${e.message}`); }
}

function isShareDebugEnabled(){
  const v = String(process.env.CRAWLER_DEBUG_SHARE||'').trim().toLowerCase();
  const flag = ['1','true','yes','on'].includes(v);
  const lvl = String(process.env.LOG_LEVEL||'').trim().toLowerCase();
  return flag || lvl === 'debug';
}

function writeShareDebug(outputDir, refNum, payload) { 
  try {
    // Only write debug artifacts when explicitly enabled or log level is debug
    if (!isShareDebugEnabled()) return;
    if (persistence && persistence.mode === 'blobs') {
      // Write debug payload to blobs so we can inspect in blob-backed runs
      const safe = String(refNum||'unknown').replace(/[^A-Za-z0-9_-]/g,'_');
      const key = `debug/share/${safe}.json`;
      try { persistence.writeJson(key, payload); } catch(e) { /* fall through to FS */ }
      return;
    }
    const dbgDir = path.join(outputDir,'debug','share');
    ensureDir(dbgDir);
    const safe = String(refNum||'unknown').replace(/[^A-Za-z0-9_-]/g,'_');
    const file = path.join(dbgDir, safe + '.json');
    fs.writeFileSync(file, JSON.stringify(payload,null,2),'utf8');
  } catch(e){ log.warn(`[debug] writeShareDebug failed ref=${refNum} ${e.message}`); }
}

module.exports = { writePerItem, writeShareLinks, writeRunMeta, writeShippingDebug, writeLfHtml, writeShareDebug, setPersistence };
