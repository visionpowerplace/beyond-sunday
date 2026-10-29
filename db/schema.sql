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
