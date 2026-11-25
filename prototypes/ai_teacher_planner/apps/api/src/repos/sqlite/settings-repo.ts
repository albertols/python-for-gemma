import type { Term } from "@planner/domain";
import type { Database } from "../../db/connection.ts";
import type { SettingsRepo } from "../ports.ts";

export function createSettingsRepo(db: Database): SettingsRepo {
  return {
    terms() {
      return db
        .prepare(
          "select id, first_pupil_day as firstPupilDay, last_pupil_day as lastPupilDay from terms order by first_pupil_day, id",
        )
        .all() as Term[];
    },
    saveTerms(terms) {
      db.transaction(() => {
        const upsert = db.prepare(
          `insert into terms (id, first_pupil_day, last_pupil_day) values (?, ?, ?)
           on conflict (id) do update set first_pupil_day = excluded.first_pupil_day, last_pupil_day = excluded.last_pupil_day`,
        );
        for (const t of terms)
          upsert.run(t.id, t.firstPupilDay, t.lastPupilDay);
      })();
    },
    getFlag(key) {
      return (
        db.prepare("select 1 from settings where key = ?").get(key) !==
        undefined
      );
    },
    setFlag(key) {
      db.prepare(
        "insert into settings (key, value) values (?, 'true') on conflict (key) do nothing",
      ).run(key);
    },
  };
}
