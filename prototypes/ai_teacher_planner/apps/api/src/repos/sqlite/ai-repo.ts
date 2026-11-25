import type { ReviewState, Source } from "@planner/domain";
import type { Database } from "../../db/connection.ts";
import type { AiItem, AiRepo, AiRun } from "../ports.ts";

interface RunRecord {
  id: string;
  skill_id: AiRun["skillId"];
  status: AiRun["status"];
  started_at: string;
  duration_ms: number | null;
  provider: string | null;
  model: string | null;
  failure: string | null;
  note: string | null;
}
interface ItemRecord {
  id: string;
  run_id: string;
  kind: string;
  target: string;
  course_id: string | null;
  data: string;
  review: ReviewState;
  reviewed_at: string | null;
  sources: string;
}

const toItem = (r: ItemRecord): AiItem => ({
  id: r.id,
  runId: r.run_id,
  kind: r.kind,
  target: r.target,
  courseId: r.course_id,
  data: JSON.parse(r.data) as unknown,
  review: r.review,
  reviewedAt: r.reviewed_at,
  sources: JSON.parse(r.sources) as Source[],
});

export function createAiRepo(db: Database): AiRepo {
  const itemIds = (runId: string) =>
    (
      db
        .prepare("select id from ai_items where run_id = ? order by rowid")
        .all(runId) as { id: string }[]
    ).map((r) => r.id);
  const toRun = (r: RunRecord): AiRun => ({
    id: r.id,
    skillId: r.skill_id,
    status: r.status,
    startedAt: r.started_at,
    durationMs: r.duration_ms,
    provider: r.provider,
    model: r.model,
    failure: r.failure,
    note: r.note,
    itemIds: itemIds(r.id),
  });
  const getItem = (id: string) => {
    const r = db.prepare("select * from ai_items where id = ?").get(id) as
      | ItemRecord
      | undefined;
    return r ? toItem(r) : null;
  };
  return {
    insertRun(run) {
      db.prepare(
        `insert into ai_runs (id, skill_id, status, started_at, duration_ms, provider, model, failure, note)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        run.id,
        run.skillId,
        run.status,
        run.startedAt,
        run.durationMs,
        run.provider,
        run.model,
        run.failure,
        run.note,
      );
    },
    getRun(id) {
      const r = db.prepare("select * from ai_runs where id = ?").get(id) as
        | RunRecord
        | undefined;
      return r ? toRun(r) : null;
    },
    listRuns() {
      const rows = db
        .prepare("select * from ai_runs order by started_at desc, rowid desc")
        .all() as RunRecord[];
      return rows.map(toRun);
    },
    updateRun(id, patch) {
      const has = (k: keyof typeof patch) => (k in patch ? 1 : 0);
      db.prepare(
        `update ai_runs set
           status = case when ? then ? else status end,
           duration_ms = case when ? then ? else duration_ms end,
           provider = case when ? then ? else provider end,
           model = case when ? then ? else model end,
           failure = case when ? then ? else failure end,
           note = case when ? then ? else note end
         where id = ?`,
      ).run(
        has("status"),
        patch.status ?? null,
        has("durationMs"),
        patch.durationMs ?? null,
        has("provider"),
        patch.provider ?? null,
        has("model"),
        patch.model ?? null,
        has("failure"),
        patch.failure ?? null,
        has("note"),
        patch.note ?? null,
        id,
      );
    },
    insertItem(item) {
      db.prepare(
        `insert into ai_items (id, run_id, kind, target, course_id, data, review, reviewed_at, sources)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        item.id,
        item.runId,
        item.kind,
        item.target,
        item.courseId,
        JSON.stringify(item.data),
        item.review,
        item.reviewedAt,
        JSON.stringify(item.sources),
      );
    },
    getItem,
    listItems(filter) {
      const rows = (
        filter?.review
          ? db
              .prepare("select * from ai_items where review = ? order by rowid")
              .all(filter.review)
          : db.prepare("select * from ai_items order by rowid").all()
      ) as ItemRecord[];
      return rows.map(toItem);
    },
    claimReview(id, review, reviewedAt, data) {
      const before = getItem(id);
      if (before?.review !== "suggested") return null;
      const changed = db
        .prepare(
          `update ai_items set review = ?, reviewed_at = ?, data = case when ? then ? else data end
           where id = ? and review = 'suggested'`,
        )
        .run(
          review,
          reviewedAt,
          data === undefined ? 0 : 1,
          JSON.stringify(data ?? null),
          id,
        ).changes;
      return changed === 1 ? before : null;
    },
    restoreItem(item) {
      db.prepare(
        "update ai_items set review = ?, reviewed_at = ?, data = ? where id = ?",
      ).run(item.review, item.reviewedAt, JSON.stringify(item.data), item.id);
    },
    failUnfinished(failure) {
      return db
        .prepare(
          "update ai_runs set status = 'failed', failure = ? where status in ('queued', 'running')",
        )
        .run(failure).changes;
    },
  };
}
