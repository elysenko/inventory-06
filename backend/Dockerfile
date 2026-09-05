# ── build ────────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

# A syntactically valid dummy DSN is enough for `prisma generate`; no database
# is contacted at build time.
ENV DATABASE_URL="postgresql://x:x@localhost:5432/x"

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
# nest build exits 0 even when rootDir is wrong and the entrypoint lands at
# dist/src/main.js — fail the image build instead of shipping a broken one.
RUN npm run build && test -f dist/main.js \
    || (echo 'ERROR: dist/main.js missing after build — check tsconfig.build.json rootDir: src' && exit 1)

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:20-slim AS production
WORKDIR /app
ENV NODE_ENV=production

# `prisma` is a runtime dependency, not a dev one: docker-entrypoint.sh runs
# `prisma migrate deploy` before the API starts.
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
# .prisma holds the query-engine binary, @prisma/client the generated client.
# Both must come from the builder: `npm ci` only installs the base package.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY prisma ./prisma
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
