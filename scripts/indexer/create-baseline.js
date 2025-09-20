#!/usr/bin/env node
/*
 Phase 0 baseline snapshot creator.
 - Ensures indexer has run (unless --no-index)
 - Hashes public/*.json + public/data/*.json
 - Stores results at scripts/_baseline/baseline-hashes.json
 - Copies snapshot json files into scripts/_baseline/snapshot/ (for diffing)
 - Use --update to overwrite existing baseline
*/
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

function hashContent(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function runIndexer() {
  console.log('[baseline] Running indexer...');
  const res = spawnSync(process.execPath, ['scripts/indexer/index-items.js'], { stdio: 'inherit' });
  if (res.status !== 0) {
    console.warn('[baseline] Indexer exited with code', res.status, '(continuing, baseline may reflect previous run)');
  }
}

function collectJsonFiles() {
  const pub = path.join(process.cwd(), 'public');
  const dataDir = path.join(pub, 'data');
  const files = [];
  function addIfJson(full, rel) {
    if (!full.endsWith('.json')) return;
    try {
      const stat = fs.statSync(full);
      const buf = fs.readFileSync(full);
      const hash = hashContent(buf);
      let json = null; let arrCount = null; let keys = null;
      try { json = JSON.parse(buf.toString('utf8')); } catch {}
      if (Array.isArray(json)) arrCount = json.length; else if (json && typeof json === 'object') keys = Object.keys(json).length;
      files.push({ rel, size: stat.size, mtime: stat.mtime.toISOString(), sha256: hash, arrayLength: arrCount, objectKeys: keys });
    } catch (e) {
      console.warn('[baseline] Failed reading', rel, e.message);
    }
  }
  if (fs.existsSync(pub)) {
    for (const name of fs.readdirSync(pub)) {
      const full = path.join(pub, name);
      if (fs.statSync(full).isFile()) addIfJson(full, path.join('public', name));
    }
  }
  if (fs.existsSync(dataDir)) {
    for (const name of fs.readdirSync(dataDir)) {
      const full = path.join(dataDir, name);
      if (fs.statSync(full).isFile()) addIfJson(full, path.join('public', 'data', name));
    }
  }
  return files.sort((a,b)=>a.rel.localeCompare(b.rel));
}

function copySnapshot(files, outDir) {
  for (const f of files) {
    const src = path.join(process.cwd(), f.rel);
    const dest = path.join(outDir, f.rel.replace(/^public[\\/]/,''));
    const destDir = path.dirname(dest);
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function main() {
  const args = process.argv.slice(2);
  const noIndex = args.includes('--no-index');
  const update = args.includes('--update');
  const baseDir = path.join(process.cwd(), 'scripts', '_baseline');
  const hashFile = path.join(baseDir, 'baseline-hashes.json');
  if (fs.existsSync(hashFile) && !update) {
    console.log('[baseline] Existing baseline found. Use --update to overwrite.');
    process.exit(0);
  }
  if (!noIndex) runIndexer();
  fs.mkdirSync(baseDir, { recursive: true });
  const files = collectJsonFiles();
  const snapshotDir = path.join(baseDir, 'snapshot');
  if (fs.existsSync(snapshotDir)) {
    if (update) {
      fs.rmSync(snapshotDir, { recursive: true, force: true });
    }
  }
  fs.mkdirSync(snapshotDir, { recursive: true });
  copySnapshot(files, snapshotDir);
  const meta = { generatedAt: new Date().toISOString(), files };
  fs.writeFileSync(hashFile, JSON.stringify(meta, null, 2), 'utf8');
  console.log('[baseline] Wrote baseline with', files.length, 'files to', path.relative(process.cwd(), hashFile));
}

if (require.main === module) {
  main();
}
