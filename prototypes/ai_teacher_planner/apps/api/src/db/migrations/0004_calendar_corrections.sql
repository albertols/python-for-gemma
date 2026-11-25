-- Her corrections to the calendar. They live apart from calendar_rows so a new import never removes them.
create table label_corrections (
  date text primary key,         -- YYYY-MM-DD
  week_label text not null check (week_label in ('W1', 'W2')),
  note text,                     -- free text she typed, at most 200 characters
  created_at text not null       -- ISO timestamp
);
create table finding_resolutions (
  date text primary key,         -- YYYY-MM-DD, the date of the import finding she settled
  decision text not null check (decision in ('teaching-day', 'no-lessons')),
  reason text,                   -- free text she typed, at most 200 characters
  created_at text not null
);
