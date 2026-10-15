# Game art is not kept in the repository, it is downloaded here at build time
FROM node:26-slim AS assets
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 imagemagick librsvg2-bin ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY scripts ./scripts
# Docker re-downloads this on every build and reruns the step below when it changed, so a new hero lands on rebuild
ADD https://api.deadlock-api.com/v1/assets/heroes /tmp/heroes.json
# The cache mount keeps downloads between builds, so a rebuild only fetches what is new
RUN --mount=type=cache,target=/app/.asset-cache python3 scripts/fetch-deadlock-assets.py

FROM node:26-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
COPY --from=assets /app/public/images ./public/images
COPY --from=assets /app/public/data ./public/data
RUN npm run build && npm prune --omit=dev

FROM node:26-slim
# The asset script also runs at startup, to pick up heroes released since the image was built
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 imagemagick librsvg2-bin ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Keep ImageMagick inside the container's memory cap (it spills to disk instead), with fewer parallel conversions
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
    MAGICK_MEMORY_LIMIT=64MiB MAGICK_MAP_LIMIT=128MiB ASSET_WORKERS=2
COPY --from=build --chown=node:node /app/package.json /app/next.config.ts ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --chown=node:node scripts ./scripts
RUN mkdir .asset-cache && chown node:node .asset-cache
USER node
EXPOSE 3000
CMD ["sh", "scripts/start.sh"]
