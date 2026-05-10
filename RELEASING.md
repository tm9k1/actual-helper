# Publishing the container image (GHCR)

Images are built by [`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml) and pushed to **GitHub Container Registry**:

`ghcr.io/<GitHub-owner>/<repo-name>:<tag>`

Example for this repository name `actual-helper`: `ghcr.io/your-username/actual-helper:1.0.0`

## One-time setup

1. Push this project to a **GitHub** repository (public or private).
2. Enable **GitHub Actions** for the repo (Settings → Actions → General).
3. First successful push creates a **package** under your account or org (your profile → **Packages**).
4. To let people **`docker pull` without logging in** (optional): open the package → **Package settings** → **Change visibility** → **Public**.

`GITHUB_TOKEN` already has `packages: write` in the workflow; no personal access token is required for publishing from Actions.

## Cut a release

Use [semantic version](https://semver.org/) tags with a **`v` prefix**:

```bash
git checkout main
git pull
git tag v1.0.0
git push origin v1.0.0
```

The workflow runs on `v*.*.*` (e.g. `v1.0.0`, `v2.3.4` — not `v1.0`).

When it finishes, pull by version (tags are normalized without the leading `v` for some labels):

```bash
docker pull ghcr.io/YOUR_GITHUB_USER/actual-helper:1.0.0
docker pull ghcr.io/YOUR_GITHUB_USER/actual-helper:latest
```

Use that reference as **`ACTUAL_HELPER_IMAGE_REF`** with [`docker-compose.registry.yml`](docker-compose.registry.yml) (see [DEPLOY.md](./DEPLOY.md)).

## Troubleshooting

| Issue | What to try |
|--------|-------------|
| Workflow does not run | Confirm the tag matches `v*.*.*` and was **pushed** (`git push origin v1.0.0`). |
| 403 when pushing to GHCR | Re-run job; ensure repository **permissions** allow Actions to write packages (org policy). |
| Pull denied / unauthorized | Package may be private; `docker login ghcr.io` with a PAT that has `read:packages`, or make the package public. |
| Wrong image name | Image path is always **lowercase** `ghcr.io/owner/repo` (GitHub normalizes for GHCR). |

## Local build and push (not recommended if Actions works)

Authenticate to GHCR, then:

```bash
docker login ghcr.io -u USERNAME
echo YOUR_PAT | docker login ghcr.io -u USERNAME --password-stdin

docker build -t ghcr.io/USERNAME/actual-helper:v1.0.0 .
docker push ghcr.io/USERNAME/actual-helper:v1.0.0
```

Use a [classic PAT](https://github.com/settings/tokens) with `write:packages` and `read:packages`.
