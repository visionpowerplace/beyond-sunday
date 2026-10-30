# Worker image: ffmpeg and yt-dlp are the whole reason this is a container
# rather than a serverless function.
FROM node:22-bookworm-slim

# Every font comes from apt. An earlier version downloaded one from GitHub and
# a 404 took the whole build down — a headline face is not worth a broken
# deploy. deno is here for yt-dlp, which now needs a JavaScript runtime to
# solve YouTube's player challenge.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 ca-certificates curl unzip fontconfig \
      fonts-dejavu fonts-dejavu-core fonts-liberation2 fonts-texgyre \
 && curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- --yes \
 && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp \
 && fc-cache -f \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY packages/core/package.json packages/core/
COPY apps/worker/package.json apps/worker/
RUN npm install --omit=dev --workspaces --include-workspace-root

COPY packages/core packages/core
COPY apps/worker apps/worker
COPY db db

ENV STORAGE_DIR=/data
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "apps/worker/index.js"]
