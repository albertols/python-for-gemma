-- A finished run can say what it left out, without being a failure. Counts only, never the model's words.
alter table ai_runs add column note text;
