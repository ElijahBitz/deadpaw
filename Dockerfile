# Game art is not kept in the repository, it is downloaded here at build time
FROM node:26-slim AS assets
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 imagemagick librsvg2-bin ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY scripts ./scripts
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
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/package.json /app/next.config.ts ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["npm", "run", "start"]
