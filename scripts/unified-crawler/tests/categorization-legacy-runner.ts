#!/usr/bin/env ts-node
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

export async function runLegacyCategorizationTests(options: { quiet?: boolean } = {}) {
  // Prefer primary legacy tests location; fallback to old-backup if pruned
  const primary = path.join(process.cwd(), 'scripts', 'indexer', 'tests');
  const backup = path.join(process.cwd(), 'scripts','indexer', 'tests');
  let testsDir = primary;
  try { await fs.access(primary); } catch { testsDir = backup; }
  const entries = await fs.readdir(testsDir);
  const testFiles = entries
    .filter((f) => f.startsWith('test-') && f.endsWith('.js') && f !== 'test-all.js')
    .sort();

  const pad = (n: number) => String(n).padStart(2, '0');
  const now = new Date();
  const startLabel = `${now.getHours()}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  console.log(`\n[categorization:legacy] Starting (${testFiles.length} files) at ${startLabel}`);

  let passed = 0;
  let failed = 0;
  const results: Array<{ file: string; code: number; ms: number }> = [];

  for (const file of testFiles) {
    const abs = path.join(testsDir, file);
    const t0 = Date.now();
    const child = spawn(process.execPath, [abs], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    const code: number = await new Promise((resolve) => child.on('close', (c) => resolve(c ?? 1)));
    const ms = Date.now() - t0;
    results.push({ file, code, ms });

    const icon = code === 0 ? '✔' : '✖';
    if (!options.quiet || code !== 0) {
      console.log(`\n[legacy:${icon}] ${file} (${ms}ms)`);
      if (stdout.trim()) console.log(stdout.trim());
      if (stderr.trim()) console.error(stderr.trim());
    }
    if (code === 0) passed++; else failed++;
  }

  // Summary
  const total = passed + failed;
  const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
  const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
  const grey = (s: string) => `\x1b[90m${s}\x1b[0m`;
  const sum = results.map(r => `${r.code === 0 ? green('PASS') : red('FAIL')}  ${grey(r.file)}  ${r.ms}ms`).join('\n');
  console.log(`\n[categorization:legacy] Summary (total=${total})\n${sum}`);
  console.log(`[categorization:legacy] Result: ${passed} passed, ${failed} failed.`);

  return { passed, failed, total };
}

if (require.main === module) {
  runLegacyCategorizationTests().then(({ failed }) => {
    process.exit(failed ? 1 : 0);
  });
}
