-- Her sticky notes on Today. Free text she typed (at most 200 characters, checked by the API), stored as given.
create table todo_notes (
  id text primary key,
  text text not null,
  scope text not null check (scope in ('day', 'week')),
  note_date text not null,       -- YYYY-MM-DD; the Monday for a week note
  done integer not null default 0 check (done in (0, 1)),
  created_at text not null       -- the API's clock, ISO
);
create index todo_notes_by_date on todo_notes (note_date);
