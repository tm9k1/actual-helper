/**
 * Removes the local Actual cache (re-downloads fresh from the server on next run).
 * Usage: CONFIRM=yes node --env-file=.env scripts/clear-local-cache.mjs
 */
import { rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DATA_DIR = resolve(process.env.ACTUAL_DATA_DIR ?? './.actual-data');

if (process.env.CONFIRM !== 'yes') {
  console.error(`Refusing to delete without CONFIRM=yes. To remove local cache:\n`);
  console.error(`  CONFIRM=yes node --env-file=.env scripts/clear-local-cache.mjs\n`);
  console.error(`Or manually: rm -rf ${DATA_DIR}`);
  process.exit(1);
}

if (existsSync(DATA_DIR)) {
  rmSync(DATA_DIR, { recursive: true, force: true });
  console.log(`Removed: ${DATA_DIR}`);
} else {
  console.log(`Nothing to remove (missing): ${DATA_DIR}`);
}
