import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Mirrors migrations/0001, 0002 and 0004 (0003's disruptions table and 0008's AI tables are only used through their repositories). The SQL file is the source of truth.

export const settings = sqliteTable("settings", {
  key: text().primaryKey(),
  value: text().notNull(), // JSON
});

export const calendarImports = sqliteTable("calendar_imports", {
  id: integer().primaryKey({ autoIncrement: true }),
  fileName: text("file_name").notNull(),
  fileHash: text("file_hash").notNull(),
  importedAt: text("imported_at").notNull(),
  rowCount: integer("row_count").notNull(),
  findings: text().notNull(), // JSON
});

export const calendarRows = sqliteTable("calendar_rows", {
  date: text().primaryKey(),
  importId: integer("import_id")
    .notNull()
    .references(() => calendarImports.id),
  rawLabel: text("raw_label"),
  weekLabel: text("week_label", { enum: ["W1", "W2"] }),
  afterSchool: text("after_school"),
  datesOfImportance: text("dates_of_importance"),
  secondaryEvent: text("secondary_event"),
  byYear: text("by_year").notNull(), // JSON
  hash: text().notNull(),
});

export const terms = sqliteTable("terms", {
  id: text({ enum: ["T1", "T2", "T3"] }).primaryKey(),
  firstPupilDay: text("first_pupil_day").notNull(),
  lastPupilDay: text("last_pupil_day").notNull(),
});

export const groups = sqliteTable("groups", {
  id: text().primaryKey(),
  yearGroup: integer("year_group").notNull(),
  programme: text({ enum: ["IGCSE", "IB", "A level"] }).notNull(),
  courseId: text("course_id").notNull(),
  track: text({ enum: ["core", "hl"] }).notNull(),
  colour: text().notNull(),
});

export const timetableVersions = sqliteTable("timetable_versions", {
  id: text().primaryKey(),
  validFrom: text("valid_from").notNull(),
  entries: text().notNull(), // JSON
  duties: text().notNull(), // JSON
});

export const reportWindows = sqliteTable("report_windows", {
  id: text().primaryKey(),
  yearGroup: integer("year_group").notNull(),
  programme: text({ enum: ["A level", "IB"] }),
  name: text().notNull(),
  dataDeadline: text("data_deadline"),
  hodReview: text("hod_review"),
  sentHome: text("sent_home"),
  dataDeadlineRaw: text("data_deadline_raw"),
  hodReviewRaw: text("hod_review_raw"),
  sentHomeRaw: text("sent_home_raw"),
});

export const parentsEvenings = sqliteTable("parents_evenings", {
  id: text().primaryKey(),
  yearGroup: integer("year_group"),
  label: text().notNull(),
  date: text(),
  dateRaw: text("date_raw"),
});

export const labelCorrections = sqliteTable("label_corrections", {
  date: text().primaryKey(),
  weekLabel: text("week_label", { enum: ["W1", "W2"] }).notNull(),
  note: text(),
  createdAt: text("created_at").notNull(),
});

export const findingResolutions = sqliteTable("finding_resolutions", {
  date: text().primaryKey(),
  decision: text({ enum: ["teaching-day", "no-lessons"] }).notNull(),
  reason: text(),
  createdAt: text("created_at").notNull(),
});
