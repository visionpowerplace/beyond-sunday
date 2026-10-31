# Beyond Sunday

One sermon in, a week of content out — and nothing goes public until a human approves it.

Upload a sermon. The pipeline transcribes it with word-level timings, then makes **clips first** — and everything else only when you ask for it, one call each:

| Box | What it is |
| --- | --- |
| Clips | 4–8 vertical 9:16 clips, burnt captions, scripture lower third |
| Highlight points | 3–5 arguments the sermon actually made, with a verbatim quote each |
| Carousels | One per point, 4–6 slides |
| Write-ups | A 120–200 word post per point |
| Summary | 150 words for whoever missed Sunday |
| Five-day devotional | Monday to Friday, each day a different part of the message |

Carousel slides are rendered as real 1080x1350 images in the church's own colours, with the logo and a background drawn to match what each slide says — a seed for growth, a path for direction, a shield for protection. Twelve motifs, all drawn from shapes, so nothing is anyone else's photograph. Clips come out 9:16 and can be re-cut per clip to 4:5, 1:1 or 16:9 from the same source.

Branding lives in **Settings**: colours, logo, handles and the default clip size, applied to every render.

Carousels and write-ups are built on the highlight points, so asking for either one makes the points first if they are not there yet.

Clips are generated automatically after transcription, because that is what a church is waiting for. The rest sit behind buttons on the sermon page: a church that only wants a devotional pays for one call, not six.

Every item is its own card in the review queue: approve, reject with a reason, or schedule it on its own day. The clips are the commodity; the pack and the approval step are the product.

**Three ways in:**

1. **Upload** the recording — everything works, including clips.
2. **A link** to Google Drive, Dropbox, OneDrive/SharePoint, Vimeo or a direct file.
3. **Pull the captions from a YouTube link** — connect the channel once in Settings and a sermon starts from its URL. `captions.download` is a documented endpoint for anyone with edit permission on the video, so this reads the church's own caption track off its own video. It is the only part of a YouTube video this product can fetch; there is no download method for the file, for anyone, including the owner. The scope asked for is `youtube.force-ssl` and nothing else — it cannot upload, delete or manage videos. Google calls that scope sensitive, so an unverified app is capped at 100 users, which is plenty for a pilot.
4. **From your sermon feed** — paste the RSS or podcast feed once and every Sunday after that is one click. Most church media platforms publish one (Subsplash, Church Online Platform, Castr, Dacast, Buzzsprout, Libsyn, PodBean), which is why this exists instead of one integration per vendor. The feed is remembered on the church, episodes are listed newest first, and picking one fills in the title and preacher.
5. **Paste the captions** — an .srt, .vtt or plain transcript. No video, no download, and no transcription call at all: the points, carousels, write-ups, summary and devotional are made in under a minute. With timings you also get clip selections, which render the moment a video is added.

Routes 3 and 5 are the honest answer to YouTube. There is no download method on any YouTube API, for anyone, including the channel that owns the video, and nothing here tries to get around the bot check that enforces it. But a channel owner can read their own caption track, through the API with their own consent or by exporting it from YouTube Studio, and that is most of the product.

One known limit: YouTube has historically refused to release **auto-generated** tracks through the API even to the owner. The code tries a human-written track first, falls back to the machine one, and if that is refused it says so and points at pasting instead of failing mysteriously. Pasting a YouTube link on any route also fills in the title and preacher from the public oEmbed endpoint.

**Where a link can point:** Google Drive, Dropbox, OneDrive/SharePoint, Vimeo or a direct file. Share-page links are turned into the file behind them and checked for reachability before anything is queued. YouTube links are refused on the link route, with the reason and a pointer to the captions route.

**Storage:** the source recording is one to three gigabytes; its clips are a few megabytes and its transcript is a column in the database. So a source is deleted once its clips are rendered and it has aged past `SOURCE_RETENTION_HOURS` (default 72), and an upload that would not fit clears older sources out of the way first. If it still would not fit, the upload is refused with the numbers rather than dying halfway through with ENOSPC. `/health` reports free space.

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

**Render speed.** A 30-second clip takes about 18 seconds on two cores. The backdrop blur runs at 192px wide and is scaled back up, which costs a third of blurring the full frame and looks identical. `CLIP_WIDTH=720` roughly halves render time again and is what the networks re-encode your upload to anyway; the default is 1080. `WORKER_CONCURRENCY` (default 3) runs several jobs at once — it does little for rendering, which already uses every core, but it stops one slow download or LLM call blocking the queue behind it.

**Rendering is a container, not a function.** A 60-minute sermon is one to three gigabytes and ffmpeg will not finish inside a serverless timeout. That is why the worker is its own Railway service with a volume.

---

## Accounts, plans and credits

A church signs up, gets a **free trial** (2 sermons, 14 days, no card), and is then on a plan: Free (1 sermon a month), Church ($29, 8) or Ministry ($69, 20). Extra sermons are bought in packs and do not expire.

Billing is counted in **sermons**, not minutes or credits. Every competitor meters minutes, and every review of them complains that a church cannot tell what a 90-minute service with a 35-minute sermon will cost. One sermon covers the transcript, the clips, and every deliverable asked for afterwards; redoing a set costs nothing extra. A sermon is charged when a recording starts processing.

**Checkout is not connected.** Choosing a plan or adding credits applies immediately and charges nothing, and says so on the page. The billing sits behind one interface, so Stripe — or Paystack for naira pricing — changes how those buttons settle and nothing else.

Passwords are scrypt-hashed, sessions are httpOnly cookies, and a password reset signs the account out everywhere. Reset email goes through Resend when `RESEND_API_KEY` is set; without it the link is logged rather than silently dropped.

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
# the whole pipeline: a real video and a real database, providers mocked
TEST_SOURCE=/path/to/any.mp4 DATABASE_URL=... node tests/e2e.mjs

# boots the worker and hits every endpoint it serves
DATABASE_URL=... STORAGE_DIR=./storage node tests/worker-smoke.mjs
```

Run the smoke test after touching `apps/worker/index.js`. `node --check` passes on a file whose handler functions have been deleted; only a running process catches that.

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

- **Posting goes through a provider.** Set `ZERNIO_API_KEY` and churches connect their own Facebook Page, Instagram, YouTube, TikTok, Threads or X in Settings; approved items then schedule or post. Going direct instead would mean Meta app review plus business verification, TikTok's separate content-posting audit, and a YouTube compliance audit to lift a quota of roughly six uploads a day — six to twelve weeks before one church could publish. Worth starting those applications anyway, because the per-profile fee grows with the church count.
- **Scheduling is the job queue, not a cron.** A publish job's `run_after` is the scheduled time, so a post due while the worker was down goes out when it comes back rather than being skipped. Rescheduling cancels the old job; every publish carries an idempotency key so a retry cannot double-post.
- **No accounts, roles or billing.** The thin slice is one shared queue.
- **No face tracking.** The crop is centred. A pastor who walks the stage will go out of frame, and this is the first thing a church will notice.
- **No music detection.** The model flags a service it believes contained worship, from the transcript alone. That is a warning, not a guarantee — a clip laid over a licensed song still gets muted or claimed.
- **No verse text on screen, only the reference.** NIV, ESV and NLT all need a licence. Use a public-domain translation or get written permission before putting verse text on a clip.
- **No translation or dubbing.** The wedge, and the next thing to build.

## The one rule

The model is wrong sometimes, and a clip that reverses what the preacher meant is worse than no clip. Nothing in this system publishes on its own. Keep it that way — the approval step is the feature, not the friction.
