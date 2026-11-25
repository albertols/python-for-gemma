-- Her plan for one content lesson, and the files she attached to it. They belong to the lesson
-- (group + lesson id such as 'ch3#2'), not to a slot, so they follow the lesson when the plan changes.
-- A spare lesson has none: its id changes on every re-plan, and the API refuses it.
-- A row exists while there is a note or at least one file; `text` is plain text, at most 2,000
-- characters (checked by the API) and may be '' when only files are attached.
-- `lesson_title` is the lesson's name when she last wrote to it, so a lesson later removed from the
-- scheme can still be listed by name.
create table lesson_notes (
  group_id text not null,
  lesson_id text not null,
  text text not null,
  lesson_title text not null,
  updated_at text not null,      -- the API's clock, ISO
  primary key (group_id, lesson_id)
);

-- One row per attached file. The file itself is data/materials/<stored_name>, where stored_name is
-- '<uuid>.<ext>'; her file name is kept here only, and is shown as text, never used as a path.
-- Not in the database backups: the files are in data/materials/.
create table lesson_materials (
  id text primary key,
  group_id text not null,
  lesson_id text not null,
  original_name text not null,
  stored_name text not null unique,
  content_type text not null,    -- decided by the API from the extension it checked, never taken from the upload
  size integer not null,
  created_at text not null,
  foreign key (group_id, lesson_id) references lesson_notes (group_id, lesson_id) on delete cascade
);
create index lesson_materials_by_lesson on lesson_materials (group_id, lesson_id, created_at);
