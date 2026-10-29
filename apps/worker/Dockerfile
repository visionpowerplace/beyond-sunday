# Worker image: ffmpeg and yt-dlp are the whole reason this is a container
# rather than a serverless function.
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 fonts-dejavu-core ca-certificates curl \
 && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY packages/core/package.json packages/core/
COPY apps/worker/package.json apps/worker/
RUN npm install --omit=dev --workspaces --include-workspace-root

COPY packages/core packages/core
COPY apps/worker apps/worker

ENV STORAGE_DIR=/data
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "apps/worker/index.js"]
