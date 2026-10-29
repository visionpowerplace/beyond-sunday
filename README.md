# Beyond Sunday

One sermon in, a week of content out — and nothing goes public until a human approves it.

Paste a YouTube link. The pipeline downloads the service, transcribes it with word-level timings, and turns that one transcript into a **content pack**:

| Box | What it is |
| --- | --- |
| Clips | 4–8 vertical 9:16 clips, burnt captions, scripture lower third |
| Highlight points | 3–5 arguments the sermon actually made, with a verbatim quote each |
| Carousels | One per point, 4–6 slides |
| Write-ups | A 120–200 word post per point |
| Summary | 150 words for whoever missed Sunday |
| Five-day devotional | Monday to Friday, each day a different part of the message |

Every item is its own card in the review queue: approve, reject with a reason, or schedule it on its own day. The clips are the commodity; the pack and the approval step are the product.

---

## What is here

```
packages/core        the pipeline: queue, providers, four stages
apps/worker          long-lived Node process: runs jobs, serves rendered files
apps/web             Next.js review queue
db/schema.sql        five tables, no ORM
tests/e2e.mjs        transcribe -> generate -> render against a real database
```

**The queue is Postgres**, not Redis: `FOR UPDATE SKIP LOCKED`, retries with square-number backoff, and a stale sweep that reclaims a job whose worker died. A sermon whose pipeline is exhausted is marked `failed` with the reason, because the loudest complaint about every tool in this market is a post that silently never happened.

**Rendering is a container, not a function.** A 60-minute sermon is one to three gigabytes and ffmpeg will not finish inside a serverless timeout. That is why the worker is its own Railway service with a volume.

---

## Run it locally

```bash
cp .env.example .env          # fill in DATABASE_URL at minimum
npm install
npm run db:init               # applies db/schema.sql

npm run worker                # terminal 1
npm run web                   # terminal 2 -> http://localhost:3000
```

It starts in **mock mode**: `TRANSCRIBE_PROVIDER=mock` and `LLM_PROVIDER=mock` so the whole thing runs with no account and no card. Mock output is obviously fake and is for building the UI, not for judging quality.

Switch the providers on when you are ready:

```env
TRANSCRIBE_PROVIDER=groq
GROQ_API_KEY=...              # console.groq.com
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=...        # your existing key works
```

You need `ffmpeg` and `yt-dlp` on PATH locally. The worker's Dockerfile installs both.

### Run the tests

```bash
# a real video and a real database, providers mocked
TEST_SOURCE=/path/to/any.mp4 DATABASE_URL=... node tests/e2e.mjs
```

---

## Deploy to Railway

Three services in one project:

1. **Postgres** — add it from the Railway dashboard. Copy `DATABASE_URL`.
2. **worker** — deploy this repo with `apps/worker/Dockerfile` (`railway.json` already points at it). Attach a **volume mounted at `/data`** and generate a public domain for it.
   Variables: `DATABASE_URL`, `STORAGE_DIR=/data`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `TRANSCRIBE_PROVIDER=groq`, `LLM_PROVIDER=openrouter`.
3. **web** — deploy the same repo, root `apps/web`, build `npm install && npm run build -w @bs/web`, start `npm run start -w @bs/web`.
   Variables: `DATABASE_URL`, `WORKER_PUBLIC_URL=https://<your-worker-domain>`.

Then run `npm run db:init` once against the production `DATABASE_URL`.

Scale the worker to two replicas when one Sunday's renders start queueing behind another's. `SKIP LOCKED` means they will not collide.

---

## What this does not do yet

Named honestly so nobody is surprised:

- **No posting.** The schedule field is stored; nothing publishes. Auto-posting needs Meta app review plus business verification, TikTok's separate Content Posting audit, and a YouTube compliance audit to lift a quota of roughly six uploads a day. Start those applications before you need them, and put a posting provider in front while you wait.
- **No accounts, roles or billing.** The thin slice is one shared queue.
- **No face tracking.** The crop is centred. A pastor who walks the stage will go out of frame, and this is the first thing a church will notice.
- **No music detection.** The model flags a service it believes contained worship, from the transcript alone. That is a warning, not a guarantee — a clip laid over a licensed song still gets muted or claimed.
- **No verse text on screen, only the reference.** NIV, ESV and NLT all need a licence. Use a public-domain translation or get written permission before putting verse text on a clip.
- **No translation or dubbing.** The wedge, and the next thing to build.

## The one rule

The model is wrong sometimes, and a clip that reverses what the preacher meant is worse than no clip. Nothing in this system publishes on its own. Keep it that way — the approval step is the feature, not the friction.
