-- Official exams her groups sit (public timetables). Seeded once on first run, then hers to edit.
create table external_exams (
  id text primary key,
  code text not null unique,     -- WBS14 01
  title text not null,           -- at most 120 characters, checked by the API
  exam_date text not null,       -- YYYY-MM-DD
  session text not null check (session in ('morning', 'afternoon')),
  duration_minutes integer not null check (duration_minutes > 0),
  group_ids text not null,       -- JSON: GroupId[]
  source text                    -- the exam board's timetable, or null
);
