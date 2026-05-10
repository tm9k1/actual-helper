#!/usr/bin/env node
/**
 * CI-friendly verify: install deps, syntax-check sources, run unit tests.
 */
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd) {
  execSync(cmd, { cwd: root, stdio: 'inherit' });
}

console.log('npm install…');
run('npm install');

const checks = [
  'src/server.js',
  'src/ensure-data-dir.js',
  'src/parse-transaction.js',
  'scripts/print-budget-ids.mjs',
  'scripts/clear-local-cache.mjs',
  'scripts/build.mjs',
];
for (const f of checks) {
  console.log(`node --check ${f}`);
  run(`node --check ${f}`);
}

console.log('node --test');
run('node --test');

console.log('build OK');
