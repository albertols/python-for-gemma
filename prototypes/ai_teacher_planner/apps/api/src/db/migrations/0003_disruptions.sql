-- Lessons she cancelled by hand. One row per group for a "groups" cancellation; rows of one cancellation share a batch.
create table disruptions (
  id text primary key,           -- t:<uuid>
  batch_id text not null,
  scope text not null,           -- JSON: DisruptionScope
  from_date text not null,       -- YYYY-MM-DD
  to_date text not null,
  periods text,                  -- JSON: Period[], or null for the whole day
  effect text not null check (effect in ('cancelled', 'cover')),
  reason text not null,
  source text not null check (source in ('calendar', 'teacher')),
  created_at text not null       -- ISO timestamp
);
create index disruptions_batch on disruptions (batch_id);
