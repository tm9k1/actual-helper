import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/** Ensure local Actual cache root exists (api.init does not mkdir). */
export function ensureActualDataDir(dataDir) {
  const p = resolve(dataDir);
  mkdirSync(p, { recursive: true });
  return p;
}
