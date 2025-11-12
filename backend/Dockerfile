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

RUN npm ci

ENV NODE_ENV=production

ARG DATABASE_URL=postgresql://biohax:biohax@postgres:5432/biohax?schema=public
ENV DATABASE_URL=${DATABASE_URL}

RUN npm run build
RUN npm run prisma:generate
RUN npm prune --omit=dev
RUN npm install "prisma@${PRISMA_CLI_VERSION}" --no-save

FROM node:${NODE_VERSION}-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=4000

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

EXPOSE 4000

CMD ["node", "dist/src/server.js"]
