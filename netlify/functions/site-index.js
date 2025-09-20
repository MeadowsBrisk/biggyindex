const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

/* Contract
 Input: none (scheduled invocation) or manual HTTP trigger
 Output: JSON { ok, mode, durationMs, itemsCount, sellersCount, scriptPath, timestamp, error? }
 Error handling: returns 500 with error message on fatal failure
*/

function findProjectRoot() {
  const candidates = [
    path.resolve(__dirname, '..', '..'),
    path.resolve(__dirname, '..'),
    process.cwd(),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'package.json'))) return c;
  }
  return process.cwd();
}

async function runDirect(scriptPath, root) {
  const beforeCwd = process.cwd();
  if (beforeCwd !== root) process.chdir(root);
  const prevIndexTrigger = process.env.INDEX_TRIGGER;
  process.env.INDEX_TRIGGER = 'netlify-function';
  try {
    console.log('[site-index] Requiring module at', scriptPath);
    const mod = require(scriptPath);
    const runFn = (mod && (mod.run || mod.main || mod.default));
    if (typeof runFn !== 'function') {
      return { ok: false, reason: 'no-exported-runner' };
    }
    const result = await runFn();
    return { ok: true, result };
  } finally {
    if (prevIndexTrigger === undefined) {
      delete process.env.INDEX_TRIGGER;
    } else {
      process.env.INDEX_TRIGGER = prevIndexTrigger;
    }
    if (process.cwd() !== beforeCwd) process.chdir(beforeCwd);
  }
}

function summarizeOutputs(root) {
  const candidateDirs = [
    path.join(root, 'public'),
    path.join(process.env.TMPDIR || '/tmp', 'public'),
  ];
  for (const dir of candidateDirs) {
    try {
      const itemsFile = path.join(dir, 'indexed_items.json');
      const sellersFile = path.join(dir, 'sellers.json');
      let itemsCount = null;
      let sellersCount = null;
      if (fs.existsSync(itemsFile)) {
        const arr = JSON.parse(fs.readFileSync(itemsFile, 'utf8'));
        if (Array.isArray(arr)) itemsCount = arr.length;
      }
      if (fs.existsSync(sellersFile)) {
        const arr = JSON.parse(fs.readFileSync(sellersFile, 'utf8'));
        if (Array.isArray(arr)) sellersCount = arr.length;
      }
      if (itemsCount != null || sellersCount != null) return { itemsCount, sellersCount };
    } catch (e) {
      console.log('[site-index] summarizeOutputs error for dir', dir, e.message);
    }
  }
  return { itemsCount: null, sellersCount: null };
}

exports.handler = async function handler(event, context) {
  const started = Date.now();
  console.log('[site-index] Invocation start');
  const root = findProjectRoot();
  const scriptPath = path.join(root, 'scripts', 'indexer', 'index-items.js');
  const scriptExists = fs.existsSync(scriptPath);
  console.log('[site-index] root:', root);
  console.log('[site-index] scriptPath exists?', scriptExists);
  if (!scriptExists) {
    try { console.log('[site-index] root listing:', fs.readdirSync(root)); } catch {}
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'index-items.js not found', scriptPath, timestamp: new Date().toISOString() })
    };
  }

  // Try direct require first
  let mode = 'direct';
  let directResult;
  try {
    directResult = await runDirect(scriptPath, root);
  } catch (e) {
    directResult = { ok: false, reason: 'direct-exception', error: e.message };
  }

  let counts = directResult?.result || null;
  if (!directResult.ok) {
    console.log('[site-index] Direct path failed reason:', directResult.reason || directResult.error);
    mode = 'spawn';
    // Fallback to spawning a fresh Node process so that process.cwd()/env are clean
    const spawnResult = await new Promise((resolve) => {
      const child = execFile(process.execPath, [scriptPath], {
        cwd: root,
        env: { ...process.env, NODE_ENV: 'production', INDEX_TRIGGER: 'netlify-function' },
        maxBuffer: 6 * 1024 * 1024,
      }, (error, stdout, stderr) => {
        if (error) {
          console.log('[site-index] spawn error:', error.message);
        }
        if (stdout) console.log('[site-index][stdout]\n' + stdout.slice(0, 4000));
        if (stderr) console.log('[site-index][stderr]\n' + stderr.slice(0, 4000));
        resolve({ error });
      });
      child.on('error', (err) => {
        console.log('[site-index] spawn setup error:', err.message);
        resolve({ error: err });
      });
    });
    if (spawnResult.error) {
      const durationMs = Date.now() - started;
      return {
        statusCode: 500,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: false, mode, durationMs, error: spawnResult.error.message, scriptPath, timestamp: new Date().toISOString() })
      };
    }
    counts = summarizeOutputs(root);
  }

  const { itemsCount, sellersCount } = counts || summarizeOutputs(root);
  const durationMs = Date.now() - started;
  console.log(`[site-index] Done mode=${mode} items=${itemsCount} sellers=${sellersCount} in ${durationMs}ms`);
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ok: true, mode, durationMs, itemsCount, sellersCount, scriptPath, timestamp: new Date().toISOString() })
  };
};
