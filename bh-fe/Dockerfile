# syntax=docker/dockerfile:1.6
ARG NODE_VERSION=20.18.1

FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .

ARG VITE_API_BASE_URL="http://localhost:4000"
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build

FROM nginx:1.27-alpine AS runtime
WORKDIR /usr/share/nginx/html

RUN apk add --no-cache gettext && mkdir -p /etc/nginx/templates

COPY --from=build /app/dist ./
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh

RUN chmod +x /docker-entrypoint.sh

ENV PORT=8080
EXPOSE 8080
CMD ["/docker-entrypoint.sh"]
