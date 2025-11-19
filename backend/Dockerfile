# syntax=docker/dockerfile:1.6
ARG NODE_VERSION=20.18.1
ARG PRISMA_CLI_VERSION=5.21.1

FROM node:${NODE_VERSION}-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY src ./src

RUN --mount=type=cache,target=/root/.npm npm ci
RUN mkdir -p node_modules/.prisma && cp -R prisma/generated/client node_modules/.prisma/

ENV NODE_ENV=production
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1

ARG DATABASE_URL=postgresql://biohax:biohax@postgres:5432/biohax?schema=public
ENV DATABASE_URL=${DATABASE_URL}

RUN npm run build
RUN npm prune --omit=dev
RUN npm install "prisma@${PRISMA_CLI_VERSION}" --no-save
RUN mkdir -p node_modules/.prisma && cp -R prisma/generated/client node_modules/.prisma/

FROM node:${NODE_VERSION}-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chown -R node:node /app
USER node

EXPOSE 4000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/src/server.js"]
