-- Her courses, seeded from fixtures/courses.2026-27.json by firstRun. Groups name them with groups.course_id.
create table courses (
  id text primary key,
  title text not null,
  board text not null check (board in ('IAL', 'IB', 'IGCSE')),
  revision_weeks integer not null check (revision_weeks >= 0)
);

-- The curriculum pack itself is a JSON file in data/packs/; only its hash is kept here, so a
-- pack file that was changed after it was locked is not taken as locked.
create table pack_locks (
  course_id text primary key references courses (id),
  hash text not null,
  locked_at text not null        -- ISO
);

-- The scheme of work. One row per item; `data` is the whole SowItem as JSON.
create table sow_items (
  course_id text not null references courses (id),
  id text not null,
  item_order real not null,      -- SowItem.order, kept as a column so the list sorts in SQL
  data text not null,            -- JSON
  primary key (course_id, id)
);

-- A group teaching an item for a different number of lessons.
create table group_overrides (
  course_id text not null references courses (id),
  group_id text not null,
  item_id text not null,
  lessons integer not null check (lessons >= 0),
  primary key (course_id, group_id, item_id)
);

-- Her decisions about a plan: pins, merges, spare-lesson edits and (from M3) cover choices,
-- homework and pace holds. `key` is the decision's id, or what identifies one with no id.
create table plan_decisions (
  course_id text not null references courses (id),
  kind text not null check (kind in ('pin', 'merge', 'flex-edit', 'cover-choice', 'homework', 'hold')),
  key text not null,
  data text not null,            -- JSON
  primary key (course_id, kind, key)
);

-- Facts: where each group is, and what happened in past lessons.
create table positions (
  group_id text primary key,
  course_id text not null references courses (id),
  next_lesson_id text,           -- null: the course is finished
  done_item_ids text not null,   -- JSON array
  as_of text not null            -- YYYY-MM-DD
);
create table lesson_log (
  id integer primary key autoincrement,
  group_id text not null,
  lesson_id text not null,
  slot_key text,
  outcome text not null check (outcome in ('taught', 'cover', 'skipped', 'homework')),
  recorded_on text not null,     -- YYYY-MM-DD
  note text                      -- her words, at most 200 characters (checked by the API)
);
create index lesson_log_by_group on lesson_log (group_id);

-- Accepted plans. A revision is immutable; undo moves the head to its parent.
create table plans (
  id text primary key,           -- the course id: one plan per course
  course_id text not null references courses (id),
  head_id text                   -- null before the first accepted plan
);
create table plan_revisions (
  id text primary key,
  plan_id text not null references plans (id),
  parent_id text references plan_revisions (id),
  label text not null,
  created_at text not null,      -- the API's clock, ISO
  snapshot text not null         -- the PlanSnapshot as JSON
);
create index plan_revisions_by_plan on plan_revisions (plan_id);
