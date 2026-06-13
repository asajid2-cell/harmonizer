FROM node:22-slim

WORKDIR /app

# Install only production deps (better-sqlite3 pulls a prebuilt glibc binary).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY integration ./integration
COPY scripts ./scripts

ENV NODE_ENV=production
ENV HOST=127.0.0.1
ENV PORT=4200
ENV DB_PATH=/data/hl-auth.db

# SQLite lives on a mounted volume so it survives rebuilds.
VOLUME ["/data"]
EXPOSE 4200

CMD ["node", "src/index.js"]
