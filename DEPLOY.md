# Deploying actual-helper

This service is a **small HTTP bridge** to [Actual Budget](https://actualbudget.org/) using [`@actual-app/api`](https://actualbudget.org/docs/api/). Host [actual-server](https://actualbudget.org/docs/install/docker) (`actualbudget/actual-server`) separately; this container only talks to it over the network.

## Prerequisites

- A running **actual-server** URL you can reach from wherever this runs (Tailscale, public HTTPS, same Docker network, etc.).
- **[Node.js 20+](https://nodejs.org/)** if you run without Docker.
- **Docker Engine + Compose v2** if you use containers (recommended for servers).

## 1. Configuration

Copy the example env and edit values (never commit `.env`).

```bash
cp .env.example .env
```

| Variable | Required | Notes |
|----------|----------|--------|
| `WEBHOOK_SECRET` | yes | Long random string; callers use `Authorization: Bearer …` |
| `ACTUAL_SERVER_URL` | yes | Base URL of actual-server, e.g. `https://budget.example.com` |
| `ACTUAL_SERVER_PASSWORD` | yes | Login password for that server |
| `ACTUAL_BUDGET_SYNC_ID` | yes | Actual → Settings → Advanced → Sync ID |
| `ACTUAL_ACCOUNT_MAP` | yes | JSON: bank suffix → Actual account UUID |
| `ACTUAL_BUDGET_FILE_PASSWORD` | if encrypted | E2E budget password, if enabled |
| `ACTUAL_DEFAULT_CATEGORY_NAME` / `_ID` | no | Category for imports (default name `UPI`) |
| `PORT` | no | Listen port inside the container (default `3847`) |
| `ACTUAL_VERBOSE` | no | Set `1` for noisy API logs |
| `TRUST_PROXY` | no | Set `1` or `true` if the app sits behind a reverse proxy and you need Express to honor `X-Forwarded-*` (optional; webhook logic does not require it today). Optional `TRUST_PROXY_HOPS` (default `1`). |

**Docker / Compose:** keep `ACTUAL_DATA_DIR=./.actual-data` in `.env` for plain `npm start`. Compose sets `ACTUAL_DATA_DIR=/data` in the container and mounts a volume there—you do not need to edit that for Docker.

### Compose-only environment (host / shell)

Set these in `.env` or export them before `docker compose` if you need non-defaults (see `docker-compose.yml`):

| Variable | Default | Purpose |
|----------|---------|--------|
| `COMPOSE_PROJECT_NAME` | `actual-helper` | Docker Compose project name |
| `ACTUAL_HELPER_CONTAINER_NAME` | `actual-helper` | Container name |
| `ACTUAL_HELPER_PUBLISH_PORT` | `3847` | **Host** port forwarded to the app |
| `ACTUAL_HELPER_VOLUME` | `actual_helper_data` | Named volume for `/data` (sync cache) |
| `ACTUAL_HELPER_IMAGE_REF` | `actual-helper:local` | **Tag** applied when you `docker compose build` |
| `ACTUAL_HELPER_BUILD_CONTEXT` | `.` | Build context path (advanced) |
| `ACTUAL_HELPER_DOCKERFILE` | `Dockerfile` | Alternate Dockerfile path |

**Prebuilt image (no build on the server):** set `ACTUAL_HELPER_IMAGE_REF` in `.env` to your registry reference (e.g. `ghcr.io/your-org/your-repo:v1.0.0`) and use **`docker-compose.registry.yml`** (build section omitted so nothing compiles on the host).

## 2. Docker Compose — build from source

From the repository root:

```bash
cp .env.example .env
# edit .env

docker compose up -d --build
```

Equivalent: `make docker-up` (see `Makefile`).

- **Data**: volume `${ACTUAL_HELPER_VOLUME:-actual_helper_data}` mounted at `/data`.
- **Health**: Compose and the image both probe `GET /health`.
- **Logs**: `docker compose logs -f actual-helper`

### One-off CLI (same config as the running service)

```bash
docker compose run --rm actual-helper node scripts/print-budget-ids.mjs
docker compose run --rm -e CONFIRM=yes actual-helper node scripts/clear-local-cache.mjs
```

## 2b. Docker Compose — pull a prebuilt image

Useful in production when you publish to GHCR or another registry (see §5).

1. In `.env`, set **`ACTUAL_HELPER_IMAGE_REF`** to the image you will pull (example: `ghcr.io/myorg/myrepo:v1.0.0`).
2. Pull and start (no local `git` / `Dockerfile` required on the server beyond compose files):

```bash
docker compose -f docker-compose.registry.yml pull
docker compose -f docker-compose.registry.yml up -d
```

The registry compose file requires `ACTUAL_HELPER_IMAGE_REF`; it is not optional there.

## 3. Docker (no Compose)

Equivalent to what Compose does:

```bash
docker build -t actual-helper:local .
docker volume create actual-helper-data

docker run -d --name actual-helper \
  --restart unless-stopped \
  -p 3847:3847 \
  --env-file .env \
  -e ACTUAL_DATA_DIR=/data \
  -v actual-helper-data:/data \
  actual-helper:local
```

Adjust host port and image name as needed.

## 4. Reverse proxy and TLS

Do **not** expose the webhook on the public internet without TLS and a strong `WEBHOOK_SECRET`. Typical pattern:

- Terminate HTTPS on **Caddy**, **Traefik**, or **nginx**.
- Proxy `{your vhost}` → `http://127.0.0.1:${ACTUAL_HELPER_PUBLISH_PORT}` (or the Docker service name on an internal network).

Example **Caddy** snippet:

```text
budget-hooks.example.com {
  reverse_proxy 127.0.0.1:3847
}
```

If the process runs behind a reverse proxy and you later add features that read client IP or scheme, set `TRUST_PROXY=1` (and optionally `TRUST_PROXY_HOPS`) so Express trusts `X-Forwarded-*`. The webhook path does not require this for typical setups.

## 5. Publishing your own image (GHCR)

Step-by-step (tags, visibility, pull commands): **[RELEASING.md](./RELEASING.md)**.

Summary: push a **`v*.*.*` Git tag** (e.g. `v1.0.0`) after enabling Actions; the workflow in `.github/workflows/docker-publish.yml` publishes to **`ghcr.io/<owner>/<repo>`** (lowercase), with **`linux/amd64`** and **`linux/arm64`** images. You can also run the workflow manually from the Actions tab (`:edge` and `:sha-*` tags).

Local push (if you do not use Actions):

```bash
docker build -t ghcr.io/myuser/actual-helper:v1 .
docker push ghcr.io/myuser/actual-helper:v1
```

## 6. Updates

- **Application code / Dockerfile**: pull git, `docker compose up -d --build`, or pull newer image and `docker compose up -d`.
- **`@actual-app/api` vs actual-server**: after a major Actual upgrade, upgrade the dependency (`npm update @actual-app/api` or rebuild the image) and, if you see migration errors, clear the local cache (see README troubleshooting / `clear-cache` script).

## 7 Security checklist

- [ ] Long random `WEBHOOK_SECRET`
- [ ] HTTPS in front of the webhook if it crosses untrusted networks
- [ ] Firewall: only your automation host (e.g. n8n) can reach the bridge port
- [ ] Back up Actual via normal Actual backup story; this volume only holds a **sync cache** (replaceable by re-downloading)
