import type {
  FindingResolution,
  LabelCorrection,
  ResolutionDecision,
  WeekLabel,
} from "@planner/domain";
import type { Database } from "../../db/connection.ts";
import type { CorrectionRepo } from "../ports.ts";

export function createCorrectionRepo(db: Database): CorrectionRepo {
  return {
    labels() {
      const records = db
        .prepare(
          "select date, week_label, note from label_corrections order by date",
        )
        .all() as {
        date: string;
        week_label: WeekLabel;
        note: string | null;
      }[];
      return records.map(
        (r): LabelCorrection => ({
          date: r.date,
          weekLabel: r.week_label,
          note: r.note,
        }),
      );
    },
    setLabel(c, createdAt) {
      db.prepare(
        "insert or replace into label_corrections (date, week_label, note, created_at) values (?, ?, ?, ?)",
      ).run(c.date, c.weekLabel, c.note, createdAt);
    },
    removeLabel(date) {
      return (
        db.prepare("delete from label_corrections where date = ?").run(date)
          .changes > 0
      );
    },
    resolutions() {
      const records = db
        .prepare(
          "select date, decision, reason from finding_resolutions order by date",
        )
        .all() as {
        date: string;
        decision: ResolutionDecision;
        reason: string | null;
      }[];
      return records.map(
        (r): FindingResolution => ({
          date: r.date,
          decision: r.decision,
          reason: r.reason,
        }),
      );
    },
    setResolution(r, createdAt) {
      db.prepare(
        "insert or replace into finding_resolutions (date, decision, reason, created_at) values (?, ?, ?, ?)",
      ).run(r.date, r.decision, r.reason, createdAt);
    },
    removeResolution(date) {
      return (
        db.prepare("delete from finding_resolutions where date = ?").run(date)
          .changes > 0
      );
    },
  };
}
