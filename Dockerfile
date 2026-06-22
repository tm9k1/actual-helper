# syntax=docker/dockerfile:1
# Node 20 + glibc: reliable native modules for @actual-app/api / better-sqlite3
ARG NODE_VERSION=20-bookworm-slim

FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:${NODE_VERSION}
ARG VERSION=dev
ARG REVISION=local
WORKDIR /app
LABEL org.opencontainers.image.title="actual-helper"
LABEL org.opencontainers.image.description="HTTP webhook bridge to Actual Budget (@actual-app/api)"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.revision="${REVISION}"

ENV NODE_ENV=production
# Persist this path with a volume so sync cache survives restarts
ENV ACTUAL_DATA_DIR=/data

RUN groupadd --system nodeapp && useradd --system --gid nodeapp nodeapp \
  && mkdir -p /data && chown nodeapp:nodeapp /data

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY src ./src
COPY scripts ./scripts

USER nodeapp
EXPOSE 3847

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3847)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--import", "src/polyfill.js", "src/server.js"]
