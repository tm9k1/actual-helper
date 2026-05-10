/**
 * Lists account and category ids from the synced budget.
 * Usage: node --env-file=.env scripts/print-budget-ids.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as api from '@actual-app/api';
import { ensureActualDataDir } from '../src/ensure-data-dir.js';

function apiPackageVersion() {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '../node_modules/@actual-app/api/package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkg.version;
  } catch {
    return '(unknown)';
  }
}

const DATA_DIR = process.env.ACTUAL_DATA_DIR ?? './.actual-data';
const SERVER_URL = process.env.ACTUAL_SERVER_URL;
const SERVER_PASSWORD = process.env.ACTUAL_SERVER_PASSWORD;
const BUDGET_SYNC_ID = process.env.ACTUAL_BUDGET_SYNC_ID;
const BUDGET_FILE_PASSWORD = process.env.ACTUAL_BUDGET_FILE_PASSWORD || undefined;

function req(name, v) {
  if (!v) throw new Error(`Missing ${name}`);
}

async function main() {
  req('ACTUAL_SERVER_URL', SERVER_URL);
  req('ACTUAL_SERVER_PASSWORD', SERVER_PASSWORD);
  req('ACTUAL_BUDGET_SYNC_ID', BUDGET_SYNC_ID);

  ensureActualDataDir(DATA_DIR);

  await api.init({
    dataDir: DATA_DIR,
    serverURL: SERVER_URL,
    password: SERVER_PASSWORD,
    verbose: false,
  });

  await api.downloadBudget(BUDGET_SYNC_ID, BUDGET_FILE_PASSWORD ? { password: BUDGET_FILE_PASSWORD } : undefined);

  const accounts = await api.getAccounts();
  const categories = await api.getCategories();

  console.log('\nAccounts (use id in ACTUAL_ACCOUNT_MAP):\n');
  for (const a of accounts) {
    const closed = a.closed ? ' [closed]' : '';
    const off = a.offbudget ? ' [off-budget]' : '';
    console.log(`  ${a.name}${closed}${off}`);
    console.log(`    id: ${a.id}`);
    console.log('');
  }

  console.log('Categories (for ACTUAL_DEFAULT_CATEGORY_ID or name match):\n');
  for (const c of categories) {
    if (c.hidden) continue;
    console.log(`  ${c.name}`);
    console.log(`    id: ${c.id}`);
    console.log('');
  }

  await api.shutdown();
}

function isMigrationMismatch(err) {
  const s = String(err?.message ?? err);
  return /out-of-sync-migrations|out of sync with migrations/i.test(s);
}

main().catch((e) => {
  console.error(e);
  if (isMigrationMismatch(e)) {
    const dir = process.env.ACTUAL_DATA_DIR ?? './.actual-data';
    console.error(`
This error means the SQLite migrations in your budget file do not match this package’s migration list (your file was last written by a different Actual release).

Installed @actual-app/api: ${apiPackageVersion()}

Fix (in order):
  1. Upgrade the API client to match your self-hosted actual-server / desktop app (same major/minor as the server image tag when possible):
       npm install @actual-app/api@latest

  2. Delete only the local cache (the server file is unchanged; you re-download a fresh copy):
       CONFIRM=yes npm run clear-cache
       npm run print-budget-ids

If it still fails, your server may be on a newer nightly than npm; try:
       npm install @actual-app/api@nightly
   (only if you run nightly Actual elsewhere.)

ACTUAL_DATA_DIR: ${dir}
`);
  }
  process.exit(1);
});
