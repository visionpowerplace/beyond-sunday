-- Beyond Sunday — thin-slice schema
-- One sermon in, a content pack out, every item reviewed before it goes anywhere.

create table if not exists churches (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  timezone      text not null default 'America/Chicago',
  logo_path     text,
  created_at    timestamptz not null default now()
);

create table if not exists sermons (
  id            uuid primary key default gen_random_uuid(),
  church_id     uuid not null references churches(id) on delete cascade,
  title         text not null,
  preacher      text,
  source_url    text,                       -- youtube link, if that is how it came in
  source_path   text,                       -- local path once downloaded or uploaded
  audio_path    text,
  duration_s    numeric,
  status        text not null default 'queued',  -- queued|ingesting|transcribing|generating|rendering|ready|failed
  error         text,
  transcript    jsonb,                      -- { text, words:[{w,start,end}], segments:[...] }
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Every piece of content the pack produces. One row per reviewable card.
create table if not exists items (
  id            uuid primary key default gen_random_uuid(),
  sermon_id     uuid not null references sermons(id) on delete cascade,
  kind          text not null,              -- clip|highlight|carousel|writeup|summary|devotional
  ordinal       int  not null default 0,
  title         text,
  body          jsonb,                      -- shape depends on kind; see packages/core/src/pipeline/generate.js
  start_s       numeric,                    -- clips only
  end_s         numeric,
  score         numeric,                    -- 0-100, the model's own confidence this stands alone
  scripture     jsonb,                      -- [{ref, text, start_s}]
  flags         jsonb default '[]'::jsonb,  -- ['cut_off_argument','music_under_speech','unverified_quote']
  asset_path    text,                       -- rendered mp4 / image, relative to STORAGE_DIR
  status        text not null default 'pending',  -- pending|approved|rejected|scheduled|posted|failed
  reject_reason text,
  scheduled_for timestamptz,
  networks      text[] default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Durable queue. Postgres only: no Redis, survives restarts, SKIP LOCKED for concurrency.
create table if not exists jobs (
  id            bigserial primary key,
  sermon_id     uuid references sermons(id) on delete cascade,
  item_id       uuid references items(id) on delete cascade,
  type          text not null,              -- ingest|transcribe|generate|render_clip
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'queued',  -- queued|running|done|failed
  attempts      int  not null default 0,
  max_attempts  int  not null default 3,
  last_error    text,
  run_after     timestamptz not null default now(),
  locked_at     timestamptz,
  locked_by     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists jobs_pickup_idx on jobs (status, run_after) where status = 'queued';
create index if not exists items_sermon_idx on items (sermon_id, kind, ordinal);
create index if not exists sermons_church_idx on sermons (church_id, created_at desc);

-- Added after the first deploy. Idempotent so db:init can run on every release.

-- Where the preaching actually is inside a full-service recording. Null means
-- "not decided yet"; the generate stage fills it in if nobody set it by hand.
alter table sermons add column if not exists sermon_start_s numeric;
alter table sermons add column if not exists sermon_end_s   numeric;
alter table sermons add column if not exists window_source  text;   -- 'manual' | 'auto'

-- One-shot token proving a browser is allowed to upload this sermon's file.
-- Cleared the moment the upload lands.
alter table sermons add column if not exists upload_token text;

alter table sermons alter column source_url drop not null;

-- The source recording is deleted once its clips exist and it has aged out;
-- this records when, so the page can explain why a re-render needs a re-upload.
alter table sermons add column if not exists source_cleaned_at timestamptz;

-- Branding, so every render looks like the church rather than like us.
alter table churches add column if not exists brand_primary text default '#16140f';
alter table churches add column if not exists brand_accent  text default '#a9802f';
alter table churches add column if not exists logo_path     text;
alter table churches add column if not exists handles       jsonb default '{}'::jsonb;
alter table churches add column if not exists default_aspect text default '9:16';
alter table churches add column if not exists logo_token    text;

-- A clip can exist in several shapes; the row is the 9:16 original and this
-- holds the others as { "1:1": "path", "4:5": "path" }.
alter table items add column if not exists variants jsonb default '{}'::jsonb;

-- Posting through a provider: the church's profile there, and what happened
-- to each item we handed over.
alter table churches add column if not exists zernio_profile_id text;

alter table items add column if not exists publish_key  text;    -- idempotency, per scheduling
alter table items add column if not exists post_id      text;
alter table items add column if not exists post_urls    jsonb default '[]'::jsonb;
alter table items add column if not exists post_error   text;
alter table items add column if not exists posted_at    timestamptz;

create index if not exists items_scheduled_idx on items (scheduled_for) where status = 'scheduled';
