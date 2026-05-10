# actual-helper

Small HTTP bridge between automation tools (for example [n8n](https://n8n.io)) and [Actual Budget](https://actualbudget.org/). Actual does not expose a writable REST API; official automation uses the Node package [`@actual-app/api`](https://actualbudget.org/docs/api/). This service connects to your self-hosted **actual-server**, downloads your budget, and accepts authenticated webhook payloads that become transactions via `importTransactions`.

## Does this sync back to the server?

Yes. The official client keeps your budget as a local file under `ACTUAL_DATA_DIR`, but it does **not** leave new transactions stranded there. Changes are replicated with Actual’s sync protocol (CRDT messages to your server’s sync endpoint—the same mechanism the desktop and web apps use). After each successful `importTransactions` batch, this bridge calls **`sync()`** so those deltas are pushed to actual-server **before** the HTTP response returns. You should then see the same transactions on any other device once it syncs.

On process exit, `shutdown()` also triggers a sync so flushed work is not lost.

## Requirements

- **Node.js 20+** (for `--env-file=.env` in helper scripts and modern defaults)

## Quick start

```bash
cp .env.example .env
# Edit .env: server URL, password, Sync ID, WEBHOOK_SECRET, ACTUAL_ACCOUNT_MAP

npm install
npm run build    # install + syntax check + unit tests
npm start
```

Health check:

```bash
curl -s http://127.0.0.1:3847/health
```

## Deployment (Docker, TLS, registry, ops)

This app is only the **webhook bridge**. Host Actual itself with the official image [`actualbudget/actual-server`](https://hub.docker.com/r/actualbudget/actual-server) ([Docker install](https://actualbudget.org/docs/install/docker)).

**Full deployment guide:** [DEPLOY.md](./DEPLOY.md) (Compose from source, **prebuilt image** compose file, `docker run`, reverse proxy, updates, security checklist). **Publishing the image to GHCR:** [RELEASING.md](./RELEASING.md).

Quick start with Compose:

```bash
cp .env.example .env
docker compose up -d --build
```

Helper targets: `make docker-up`, `make help`.

## Configuration

Copy `.env.example` to `.env`. Important variables:

| Variable | Description |
|----------|-------------|
| `WEBHOOK_SECRET` | Long random string; callers must send `Authorization: Bearer <this>` |
| `ACTUAL_SERVER_URL` | Base URL of your actual-server (e.g. `https://your-host`) |
| `ACTUAL_SERVER_PASSWORD` | Password you use to log into the server |
| `ACTUAL_BUDGET_SYNC_ID` | Settings → Show advanced settings → **Sync ID** |
| `ACTUAL_BUDGET_FILE_PASSWORD` | Only if end-to-end encryption is enabled on the file |
| `ACTUAL_ACCOUNT_MAP` | JSON object mapping bank account suffix (usually last 4 digits) to Actual **account id** (UUID) |
| `ACTUAL_DATA_DIR` | Local cache directory for synced budget data (default `./.actual-data`; created automatically if missing) |
| `ACTUAL_DEFAULT_CATEGORY_NAME` | Defaults to `UPI`; imports get this category if it exists |
| `ACTUAL_DEFAULT_CATEGORY_ID` | Optional; if set, skips name lookup and uses this category id |
| `PORT` | HTTP listen port (default `3847`) |

### Finding account and category IDs

Run after `.env` is filled:

```bash
npm run print-budget-ids
```

Prints each account and category **name** and **id**. Use account ids in `ACTUAL_ACCOUNT_MAP` and optionally copy a category id into `ACTUAL_DEFAULT_CATEGORY_ID`.

### Troubleshooting: “Database is out of sync with migrations”

That error means the budget file’s `__migrations__` history does not match the migration list inside your installed `@actual-app/api`. Common cases:

1. **The budget on the server was last saved by a newer Actual** (web/desktop or a newer server stack) than the npm package in this project—often fixed by upgrading the client **before** re-downloading.
2. **Stale local cache** under `ACTUAL_DATA_DIR` (less often the root cause if the download itself fails).

**Fix (try in this order):**

```bash
npm install @actual-app/api@latest
CONFIRM=yes npm run clear-cache
npm run print-budget-ids
```

Match `@actual-app/api` to your **actual-server** release when possible (same generation as your Docker image or release notes). If you use Actual nightlies everywhere, you can install `npm install @actual-app/api@nightly` so migrations align.

The follow-up **`No budget file is open`** message is usually the library reacting to a failed open after the migration error; fixing migrations resolves both.

### Self-signed HTTPS

If your server uses a custom CA or self-signed certificate, see [Actual’s API docs — Self-Signed HTTPS](https://actualbudget.org/docs/api/) (`NODE_EXTRA_CA_CERTS`, etc.).

## HTTP API

### `GET /health`

No auth. Returns `{ "ok": true }` if the process is running.

### `POST /transactions`

**Headers**

- `Authorization: Bearer <WEBHOOK_SECRET>`
- `Content-Type: application/json`

**Body** — either a **JSON array** of rows, or `{ "items": [ ... ] }`, or a single object (wrapped into one-element handling).

Each row should include fields compatible with your parser, for example:

| Field | Role |
|-------|------|
| `amount` | Number in currency units (e.g. `10` for ₹10) |
| `type` | `"debit"` (outflow) or `"credit"` (inflow) |
| `accountEnding` | Used with last 4 digits to resolve Actual account via `ACTUAL_ACCOUNT_MAP` |
| `txnDate` | `DD-MM-YY` or `DD/MM/YY` |
| `payeeName` | Payee display name |
| `vpa` | Stored in notes / imported payee when present |
| `upiRef` | Becomes `imported_id` `upi:<ref>` so duplicates are not re-imported |
| `raw` | Optional full email text for notes |

Success response shape (simplified):

```json
{
  "ok": true,
  "results": [
    {
      "accountId": "...",
      "added": ["..."],
      "updated": [],
      "errors": []
    }
  ]
}
```

## n8n

Use an **HTTP Request** node:

- Method: `POST`
- URL: `https://<your-bridge-host>/transactions`
- Authentication: Generic Credential Type → Header Auth, or add header `Authorization` = `Bearer YOUR_SECRET`
- Body: JSON — attach your parsed items array or reference prior node output

Place the bridge where it can reach your Actual server (same VPS, tailnet, or public HTTPS with secret).

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run build` | `npm install`, syntax-check sources, run tests |
| `npm test` | Unit tests only |
| `npm start` | Start webhook server |
| `npm run print-budget-ids` | List account/category ids (needs `.env`) |
| `CONFIRM=yes npm run clear-cache` | Delete `ACTUAL_DATA_DIR` so the next run re-downloads the budget |
| Docker / production | [DEPLOY.md](./DEPLOY.md) — Compose, registry image, TLS, GHCR |

## Development

- Parsing helpers live in `src/parse-transaction.js` and are covered by `test/parse-transaction.test.mjs`.
- End-to-end behaviour (real Actual server) is not run in CI; use `npm start` with a real `.env` for integration checks.

## References

- [Using the API | Actual Budget](https://actualbudget.org/docs/api/)
- [API Reference](https://actualbudget.org/docs/api/reference/)
