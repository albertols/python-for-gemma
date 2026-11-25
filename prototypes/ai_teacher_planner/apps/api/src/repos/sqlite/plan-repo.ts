import type { PlanRevision, PlanSnapshot } from "@planner/domain";
import type { Database } from "../../db/connection.ts";
import type { PlanRepo } from "../ports.ts";

interface Record_ {
  id: string;
  plan_id: string;
  parent_id: string | null;
  label: string;
  created_at: string;
  snapshot: string;
}
const toRevision = (r: Record_): PlanRevision => ({
  id: r.id,
  planId: r.plan_id,
  parentId: r.parent_id,
  label: r.label,
  createdAt: r.created_at,
  snapshot: JSON.parse(r.snapshot) as PlanSnapshot,
});

export function createPlanRepo(db: Database): PlanRepo {
  const get = (id: string) => {
    const r = db.prepare("select * from plan_revisions where id = ?").get(id) as
      | Record_
      | undefined;
    return r ? toRevision(r) : null;
  };
  return {
    head(planId) {
      const r = db
        .prepare(
          "select r.* from plans p join plan_revisions r on r.id = p.head_id where p.id = ?",
        )
        .get(planId) as Record_ | undefined;
      return r ? toRevision(r) : null;
    },
    get,
    heads() {
      return (
        db
          .prepare(
            "select r.* from plans p join plan_revisions r on r.id = p.head_id order by p.id",
          )
          .all() as Record_[]
      ).map(toRevision);
    },
    insertHead(revision, courseId) {
      db.transaction(() => {
        db.prepare(
          "insert into plans (id, course_id, head_id) values (?, ?, null) on conflict (id) do nothing",
        ).run(revision.planId, courseId);
        db.prepare(
          "insert into plan_revisions (id, plan_id, parent_id, label, created_at, snapshot) values (?, ?, ?, ?, ?, ?)",
        ).run(
          revision.id,
          revision.planId,
          revision.parentId,
          revision.label,
          revision.createdAt,
          JSON.stringify(revision.snapshot),
        );
        db.prepare("update plans set head_id = ? where id = ?").run(
          revision.id,
          revision.planId,
        );
      })();
    },
    setHead(planId, revisionId) {
      const r = get(revisionId);
      if (!r || r.planId !== planId)
        throw new Error(`revision ${revisionId} is not in plan ${planId}`);
      db.prepare("update plans set head_id = ? where id = ?").run(
        revisionId,
        planId,
      );
    },
  };
}
