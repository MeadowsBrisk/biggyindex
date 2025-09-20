const fs = require('fs');
const path = require('path');
const log = require('../util/logger');

function migrateStateShape(state){
  const s = state && typeof state === 'object' ? state : { version:1, items:{} };
  if (!s.version || s.version < 2) {
    for (const [k,v] of Object.entries(s.items||{})) {
      if (v && typeof v === 'object') {
        if (!v.lastFullCrawlAt) v.lastFullCrawlAt = v.lastRun || null;
        if (!v.lastReviewSnapshotAt) v.lastReviewSnapshotAt = v.lastRun || null;
        if (!v.firstSeenAt) v.firstSeenAt = v.firstRunAt || v.lastRun || new Date().toISOString();
        if (!v.lastIndexedUpdatedAt) v.lastIndexedUpdatedAt = null;
      }
    }
    s.version = 2;
  }
  return s;
}

function loadState(outputDir) {
  const file = path.join(outputDir, 'crawler-state.json');
  try {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file,'utf8'));
      return migrateStateShape(data);
    }
  } catch (e) {
    log.warn(`Failed to load state: ${e.message}`);
  }
  return { version:1, items:{} };
}
function saveState(outputDir, state) {
  try {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir,{recursive:true});
    fs.writeFileSync(path.join(outputDir,'crawler-state.json'), JSON.stringify(state,null,2),'utf8');
  } catch (e) {
    log.warn(`Failed to save state: ${e.message}`);
  }
}

// Blobs-aware async versions
async function loadStateAsync({ outputDir, persistence }){
  if (persistence && persistence.mode === 'blobs') {
    try {
      const s = await persistence.readJson('crawler-state.json');
      if (s) return migrateStateShape(s);
    } catch (e) { log.warn(`Failed to load state (blobs): ${e.message}`); }
    return { version:1, items:{} };
  }
  return loadState(outputDir);
}

async function saveStateAsync({ outputDir, state, persistence }){
  if (persistence && persistence.mode === 'blobs') {
    try {
      const ok = await persistence.writeJson('crawler-state.json', state);
      if (!ok) {
        log.warn('Failed to save state (blobs): write returned false');
      }
      return;
    } catch (e) { log.warn(`Failed to save state (blobs): ${e.message}`); return; }
  }
  return saveState(outputDir, state);
}

module.exports = { loadState, saveState, loadStateAsync, saveStateAsync };

