-- Keep the text of each report and parents' evening date as written, so Setup can list the unreadable ones.
alter table report_windows add column data_deadline_raw text;
alter table report_windows add column hod_review_raw text;
alter table report_windows add column sent_home_raw text;
alter table parents_evenings add column date_raw text;
