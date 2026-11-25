-- One row per AI job. Only the outcome is kept: never the prompt, the extracted text or a file path.
create table ai_runs (
  id text primary key,
  skill_id text not null,
  status text not null check (status in ('queued', 'running', 'done', 'failed', 'cancelled')),
  started_at text not null,      -- the API's clock, ISO
  duration_ms integer,
  provider text,
  model text,
  failure text                   -- a sentence she can read, never an error code
);
create index ai_runs_by_start on ai_runs (started_at);

-- What a run suggested. Each item waits for her review before it is applied or exported.
create table ai_items (
  id text primary key,
  run_id text not null references ai_runs (id),
  kind text not null,
  target text not null,
  course_id text,                -- lets an export leave out only the pending items of its own course
  data text not null,            -- JSON
  review text not null check (review in ('suggested', 'accepted', 'edited', 'rejected')),
  reviewed_at text,
  sources text not null          -- JSON array of { url, title, opened }
);
create index ai_items_by_run on ai_items (run_id);
create index ai_items_by_review on ai_items (review);
