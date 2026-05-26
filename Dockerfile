# ============================================
# Multi-stage Dockerfile para la API NestJS
# ============================================

# ---------- Etapa 1: deps ----------
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# ---------- Etapa 2: build ----------
FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build
# ---------- Etapa 3: runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl tini && \
    addgroup -S app && adduser -S app -G app

ENV NODE_ENV=production

COPY --chown=app:app package*.json ./
COPY --chown=app:app prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/dist-worker ./dist-worker

USER app
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
