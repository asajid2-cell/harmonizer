FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
RUN npx playwright install --with-deps chromium
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --break-system-packages yt-dlp
COPY server.js proxy.js resolver.js manga.js book.js audiobook.js requireAccess.cjs safeUrl.js ssrf.js discovery.js discovery_feeds.js ./
COPY public/ ./public/
EXPOSE 4190
CMD ["node", "server.js"]
