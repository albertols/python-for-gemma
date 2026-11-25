-- Calendar, timetable and report dates. JSON columns hold structured values as text.
create table settings (
  key text primary key,
  value text not null            -- JSON
);

create table calendar_imports (
  id integer primary key autoincrement,
  file_name text not null,
  file_hash text not null,
  imported_at text not null,     -- ISO timestamp
  row_count integer not null,
  findings text not null         -- JSON: ImportFinding[]
);

create table calendar_rows (
  date text primary key,         -- YYYY-MM-DD
  import_id integer not null references calendar_imports (id),
  raw_label text,
  week_label text check (week_label in ('W1', 'W2')),
  after_school text,
  dates_of_importance text,
  secondary_event text,
  by_year text not null,         -- JSON: Partial<Record<YearGroup, YearCells>>
  hash text not null
);

create table terms (
  id text primary key check (id in ('T1', 'T2', 'T3')),
  first_pupil_day text not null,
  last_pupil_day text not null
);

create table groups (
  id text primary key,
  year_group integer not null,
  programme text not null check (programme in ('IGCSE', 'IB', 'A level')),
  course_id text not null,
  track text not null check (track in ('core', 'hl')),
  colour text not null
);

create table timetable_versions (
  id text primary key,
  valid_from text not null,
  entries text not null,         -- JSON: TimetableEntry[]
  duties text not null           -- JSON: DutyEntry[]
);

create table report_windows (
  id text primary key,
  year_group integer not null,
  programme text check (programme in ('A level', 'IB')),
  name text not null,
  data_deadline text,
  hod_review text,
  sent_home text
);

create table parents_evenings (
  id text primary key,
  year_group integer,
  label text not null,
  date text
);
