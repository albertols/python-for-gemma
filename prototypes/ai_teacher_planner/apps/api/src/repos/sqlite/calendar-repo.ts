import type { CalendarRow } from "@planner/domain";
import type { Database } from "../../db/connection.ts";
import type {
  CalendarRepo,
  StoredImport,
  StoredParentsEvening,
  StoredReportWindow,
} from "../ports.ts";

interface RowRecord {
  date: string;
  raw_label: string | null;
  week_label: "W1" | "W2" | null;
  after_school: string | null;
  dates_of_importance: string | null;
  secondary_event: string | null;
  by_year: string;
  hash: string;
}
interface WindowRecord {
  id: string;
  year_group: number;
  programme: "A level" | "IB" | null;
  name: string;
  data_deadline: string | null;
  hod_review: string | null;
  sent_home: string | null;
  data_deadline_raw: string | null;
  hod_review_raw: string | null;
  sent_home_raw: string | null;
}
interface EveningRecord {
  id: string;
  year_group: number | null;
  label: string;
  date: string | null;
  date_raw: string | null;
}
interface ImportRecord {
  id: number;
  file_name: string;
  file_hash: string;
  imported_at: string;
  findings: string;
}

export function createCalendarRepo(db: Database): CalendarRepo {
  return {
    latestImport() {
      const r = db
        .prepare(
          "select id, file_name, file_hash, imported_at, findings from calendar_imports order by id desc limit 1",
        )
        .get() as ImportRecord | undefined;
      if (!r) return null;
      return {
        id: r.id,
        fileName: r.file_name,
        fileHash: r.file_hash,
        importedAt: r.imported_at,
        findings: JSON.parse(r.findings) as StoredImport["findings"],
      };
    },

    rows() {
      const records = db
        .prepare("select * from calendar_rows order by date")
        .all() as RowRecord[];
      return records.map(
        (r): CalendarRow => ({
          date: r.date,
          rawLabel: r.raw_label,
          weekLabel: r.week_label,
          afterSchool: r.after_school,
          datesOfImportance: r.dates_of_importance,
          secondaryEvent: r.secondary_event,
          byYear: JSON.parse(r.by_year) as CalendarRow["byYear"],
          hash: r.hash,
        }),
      );
    },

    replaceCalendar({ file, rows, windows, evenings }) {
      db.transaction(() => {
        const { lastInsertRowid } = db
          .prepare(
            "insert into calendar_imports (file_name, file_hash, imported_at, row_count, findings) values (?, ?, ?, ?, ?)",
          )
          .run(
            file.fileName,
            file.fileHash,
            file.importedAt,
            rows.length,
            JSON.stringify(file.findings),
          );
        db.prepare("delete from calendar_rows").run();
        const insertRow = db.prepare(
          `insert into calendar_rows (date, import_id, raw_label, week_label, after_school, dates_of_importance, secondary_event, by_year, hash)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const r of rows)
          insertRow.run(
            r.date,
            lastInsertRowid,
            r.rawLabel,
            r.weekLabel,
            r.afterSchool,
            r.datesOfImportance,
            r.secondaryEvent,
            JSON.stringify(r.byYear),
            r.hash,
          );
        db.prepare("delete from report_windows").run();
        const insertWindow = db.prepare(
          `insert into report_windows (id, year_group, programme, name, data_deadline, hod_review, sent_home, data_deadline_raw, hod_review_raw, sent_home_raw)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const w of windows)
          insertWindow.run(
            w.id,
            w.yearGroup,
            w.programme,
            w.name,
            w.dataDeadline,
            w.hodReview,
            w.sentHome,
            w.raw.dataDeadline,
            w.raw.hodReview,
            w.raw.sentHome,
          );
        db.prepare("delete from parents_evenings").run();
        const insertEvening = db.prepare(
          "insert into parents_evenings (id, year_group, label, date, date_raw) values (?, ?, ?, ?, ?)",
        );
        for (const e of evenings)
          insertEvening.run(e.id, e.yearGroup, e.label, e.date, e.raw);
      })();
    },

    windows() {
      const records = db
        .prepare("select * from report_windows order by id")
        .all() as WindowRecord[];
      return records.map(
        (w): StoredReportWindow => ({
          id: w.id,
          yearGroup: w.year_group as StoredReportWindow["yearGroup"],
          programme: w.programme,
          name: w.name,
          dataDeadline: w.data_deadline,
          hodReview: w.hod_review,
          sentHome: w.sent_home,
          raw: {
            dataDeadline: w.data_deadline_raw,
            hodReview: w.hod_review_raw,
            sentHome: w.sent_home_raw,
          },
        }),
      );
    },

    setWindowDate(id, field, date) {
      const column = {
        dataDeadline: "data_deadline",
        hodReview: "hod_review",
        sentHome: "sent_home",
      }[field];
      return (
        db
          .prepare(`update report_windows set ${column} = ? where id = ?`)
          .run(date, id).changes > 0
      );
    },

    setEveningDate(id, date) {
      return (
        db
          .prepare("update parents_evenings set date = ? where id = ?")
          .run(date, id).changes > 0
      );
    },

    evenings() {
      const records = db
        .prepare("select * from parents_evenings order by id")
        .all() as EveningRecord[];
      return records.map(
        (e): StoredParentsEvening => ({
          id: e.id,
          yearGroup: e.year_group as StoredParentsEvening["yearGroup"],
          label: e.label,
          date: e.date,
          raw: e.date_raw,
        }),
      );
    },
  };
}
