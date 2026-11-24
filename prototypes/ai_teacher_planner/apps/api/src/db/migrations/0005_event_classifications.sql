-- Her confirmations of calendar events. A new import never touches them; the lessons they cancel are worked out when slots are built.
create table event_classifications (
  id text primary key,
  wording_key text not null,     -- the event text, lower case, spaces collapsed
  year_group integer,            -- null: a whole-school event
  only_dates text,               -- JSON: IsoDate[], or null for every date of the event
  decision text not null check (decision in ('cancels', 'no-effect')),
  group_ids text,                -- JSON: GroupId[], or null for the year (or the whole school)
  periods text,                  -- JSON: Period[], or null for the whole day
  until_date text,               -- each kept date cancels from that date through this one
  provenance text not null check (provenance in ('engine', 'ai', 'teacher', 'import')),
  created_at text not null       -- ISO timestamp
);
