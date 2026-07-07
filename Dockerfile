# Solvio — obraz produkcyjny (Coolify / dowolny Docker host)
# Build:  docker build -t solvio .
# Run:    docker run -p 3000:3000 --env-file .env solvio
#
# Wymagane zmienne środowiskowe w runtime — patrz docs/DEPLOY-COOLIFY.md

# ── Etap 1: zależności ─────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
# lockfile generowany przez npm 11 — npm 10 z obrazu inaczej dedupuje esbuild
RUN npm install -g npm@11
COPY package.json package-lock.json ./
RUN npm ci

# ── Etap 2: build ──────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# standalone output tylko dla Dockera (Vercel buduje bez tej flagi)
ENV NEXT_OUTPUT_STANDALONE=1
ENV NEXT_TELEMETRY_DISABLED=1
# Build nie potrzebuje sekretów — DB jest leniwie inicjalizowana (Proxy),
# a strony z danymi są dynamiczne. Dummy URL wycisza walidacje configów.
ENV DATABASE_URL="postgres://build:build@localhost:5432/build"
RUN npm run build

# ── Etap 3: runtime ────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001

# standalone zawiera server.js + minimalny node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
