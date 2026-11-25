import type { Disruption } from "@planner/domain";
import type { Database } from "../../db/connection.ts";
import type { DisruptionRepo, StoredDisruption } from "../ports.ts";

interface Record_ {
  id: string;
  batch_id: string;
  scope: string;
  from_date: string;
  to_date: string;
  periods: string | null;
  effect: Disruption["effect"];
  reason: string;
  source: Disruption["source"];
  created_at: string;
}

export function createDisruptionRepo(db: Database): DisruptionRepo {
  const insert = db.prepare(
    `insert into disruptions (id, batch_id, scope, from_date, to_date, periods, effect, reason, source, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  return {
    list() {
      const records = db
        .prepare("select * from disruptions order by from_date, id")
        .all() as Record_[];
      return records.map(
        (r): StoredDisruption => ({
          id: r.id,
          batchId: r.batch_id,
          scope: JSON.parse(r.scope) as Disruption["scope"],
          from: r.from_date,
          to: r.to_date,
          periods:
            r.periods === null
              ? null
              : (JSON.parse(r.periods) as NonNullable<Disruption["periods"]>),
          effect: r.effect,
          reason: r.reason,
          source: r.source,
          createdAt: r.created_at,
        }),
      );
    },
    add(rows) {
      db.transaction(() => {
        for (const d of rows)
          insert.run(
            d.id,
            d.batchId,
            JSON.stringify(d.scope),
            d.from,
            d.to,
            d.periods === null ? null : JSON.stringify(d.periods),
            d.effect,
            d.reason,
            d.source,
            d.createdAt,
          );
      })();
    },
    removeBatch(batchId) {
      return db
        .prepare("delete from disruptions where batch_id = ?")
        .run(batchId).changes;
    },
  };
}
