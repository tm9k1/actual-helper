import express from 'express';
import * as api from '@actual-app/api';
import { ensureActualDataDir } from './ensure-data-dir.js';
import { parseDdMmYy, signedIntegerAmount } from './parse-transaction.js';

const PORT = Number(process.env.PORT ?? 3847);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const DATA_DIR = process.env.ACTUAL_DATA_DIR ?? './.actual-data';
const SERVER_URL = process.env.ACTUAL_SERVER_URL;
const SERVER_PASSWORD = process.env.ACTUAL_SERVER_PASSWORD;
const BUDGET_SYNC_ID = process.env.ACTUAL_BUDGET_SYNC_ID;
const BUDGET_FILE_PASSWORD = process.env.ACTUAL_BUDGET_FILE_PASSWORD || undefined;
/** JSON map: last 4 digits (string) -> Actual account id */
const ACCOUNT_MAP = JSON.parse(process.env.ACTUAL_ACCOUNT_MAP ?? '{}');
const DEFAULT_CATEGORY_ID = process.env.ACTUAL_DEFAULT_CATEGORY_ID?.trim() || null;
const DEFAULT_CATEGORY_NAME = (process.env.ACTUAL_DEFAULT_CATEGORY_NAME ?? 'UPI').trim();

/** Set after budget loads */
let resolvedDefaultCategoryId = null;

function requireEnv(name, value) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
}

async function initActual() {
  requireEnv('ACTUAL_SERVER_URL', SERVER_URL);
  requireEnv('ACTUAL_SERVER_PASSWORD', SERVER_PASSWORD);
  requireEnv('ACTUAL_BUDGET_SYNC_ID', BUDGET_SYNC_ID);

  ensureActualDataDir(DATA_DIR);

  await api.init({
    dataDir: DATA_DIR,
    serverURL: SERVER_URL,
    password: SERVER_PASSWORD,
    verbose: process.env.ACTUAL_VERBOSE === '1',
  });

  await api.downloadBudget(BUDGET_SYNC_ID, BUDGET_FILE_PASSWORD ? { password: BUDGET_FILE_PASSWORD } : undefined);

  if (DEFAULT_CATEGORY_ID) {
    resolvedDefaultCategoryId = DEFAULT_CATEGORY_ID;
    console.log(`Using ACTUAL_DEFAULT_CATEGORY_ID (${resolvedDefaultCategoryId})`);
    return;
  }

  if (!DEFAULT_CATEGORY_NAME) return;

  const categories = await api.getCategories();
  const lower = DEFAULT_CATEGORY_NAME.toLowerCase();
  const cat =
    categories.find((c) => c.name === DEFAULT_CATEGORY_NAME) ??
    categories.find((c) => c.name.toLowerCase() === lower);

  if (!cat) {
    console.warn(
      `No category named "${DEFAULT_CATEGORY_NAME}". Create it in Actual or set ACTUAL_DEFAULT_CATEGORY_ID / ACTUAL_DEFAULT_CATEGORY_NAME.`,
    );
    return;
  }

  resolvedDefaultCategoryId = cat.id;
  console.log(`Default category: "${cat.name}" (${resolvedDefaultCategoryId})`);
}

function mapPayload(row) {
  const ending = String(row.accountEnding ?? '').slice(-4);
  const accountId = ACCOUNT_MAP[ending] ?? ACCOUNT_MAP[row.accountEnding];
  if (!accountId) {
    throw new Error(
      `No Actual account id for accountEnding "${row.accountEnding}". Set ACTUAL_ACCOUNT_MAP, e.g. {"0646":"<uuid>"}`,
    );
  }

  const date = parseDdMmYy(row.txnDate);
  const amount = signedIntegerAmount(row.amount, row.type);
  const payee_name = row.payeeName || row.vpa || 'Unknown';
  const imported_id = row.upiRef ? `upi:${row.upiRef}` : undefined;
  const notes = [row.vpa && `VPA: ${row.vpa}`, row.raw && `Email: ${row.raw}`].filter(Boolean).join('\n');

  const tx = {
    date,
    amount,
    payee_name,
    imported_payee: row.vpa || undefined,
    imported_id,
    notes: notes || undefined,
  };

  if (resolvedDefaultCategoryId) {
    tx.category = resolvedDefaultCategoryId;
  }

  return {
    accountId,
    ...tx,
  };
}

async function main() {
  requireEnv('WEBHOOK_SECRET', WEBHOOK_SECRET);

  await initActual();

  const app = express();
  const trust = process.env.TRUST_PROXY;
  if (trust === '1' || trust === 'true') {
    app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1) || 1);
  }
  app.use(express.json({ limit: '512kb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/transactions', async (req, res) => {
    const auth = req.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token !== WEBHOOK_SECRET) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    try {
      const body = req.body;
      const rows = Array.isArray(body) ? body : body?.items ?? [body];
      if (!Array.isArray(rows) || rows.length === 0) {
        res.status(400).json({ error: 'expected a JSON array or { items: [...] }' });
        return;
      }

      const byAccount = new Map();
      for (const row of rows) {
        const { accountId, ...tx } = mapPayload(row);
        if (!byAccount.has(accountId)) byAccount.set(accountId, []);
        byAccount.get(accountId).push(tx);
      }

      const results = [];
      for (const [accountId, transactions] of byAccount) {
        const r = await api.importTransactions(accountId, transactions, {
          reimportDeleted: false,
          defaultCleared: true,
        });
        results.push({ accountId, ...r });
      }

      // Push CRDT deltas to actual-server immediately (library also debounces ~1s otherwise).
      try {
        await api.sync();
      } catch (syncErr) {
        console.error(syncErr);
        res.status(503).json({
          error: String(syncErr?.message ?? syncErr),
          results,
          hint: 'Transactions may exist only on this node until sync succeeds; retry or check server connectivity.',
        });
        return;
      }

      res.json({ ok: true, results });
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: String(err?.message ?? err) });
    }
  });

  const server = app.listen(PORT, () => {
    console.log(`actual-helper listening on :${PORT}`);
  });

  const shutdown = async () => {
    server.close();
    await api.shutdown();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
