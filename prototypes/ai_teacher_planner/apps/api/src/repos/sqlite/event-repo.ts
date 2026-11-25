import type { EventClassification } from "@planner/domain";
import type { Database } from "../../db/connection.ts";
import type { EventRepo } from "../ports.ts";

interface Record_ {
  id: string;
  wording_key: string;
  year_group: EventClassification["yearGroup"];
  only_dates: string | null;
  decision: EventClassification["decision"];
  group_ids: string | null;
  periods: string | null;
  until_date: string | null;
  provenance: EventClassification["provenance"];
}

const json = <T>(text: string | null) =>
  text === null ? null : (JSON.parse(text) as T);
const text = (value: unknown) =>
  value === null ? null : JSON.stringify(value);

export function createEventRepo(db: Database): EventRepo {
  return {
    list() {
      const records = db
        .prepare("select * from event_classifications order by id")
        .all() as Record_[];
      return records.map(
        (r): EventClassification => ({
          id: r.id,
          wordingKey: r.wording_key,
          yearGroup: r.year_group,
          onlyDates: json(r.only_dates),
          decision: r.decision,
          groupIds: json(r.group_ids),
          periods: json(r.periods),
          until: r.until_date,
          provenance: r.provenance,
        }),
      );
    },
    upsert(k, createdAt) {
      db.prepare(
        `insert or replace into event_classifications
         (id, wording_key, year_group, only_dates, decision, group_ids, periods, until_date, provenance, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        k.id,
        k.wordingKey,
        k.yearGroup,
        text(k.onlyDates),
        k.decision,
        text(k.groupIds),
        text(k.periods),
        k.until,
        k.provenance,
        createdAt,
      );
    },
    remove(id) {
      return (
        db.prepare("delete from event_classifications where id = ?").run(id)
          .changes > 0
      );
    },
  };
}
