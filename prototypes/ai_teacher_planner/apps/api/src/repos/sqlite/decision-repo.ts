import type { Database } from "../../db/connection.ts";
import type { DecisionRepo, Decisions } from "../ports.ts";

/** Each kind's column value, and what identifies one decision of that kind. */
const KINDS: {
  [K in keyof Decisions]: {
    kind: string;
    key: (row: Decisions[K][number]) => string;
  };
} = {
  pins: { kind: "pin", key: (r) => r.id },
  merges: { kind: "merge", key: (r) => r.id },
  flexEdits: { kind: "flex-edit", key: (r) => r.flexId },
  coverChoices: { kind: "cover-choice", key: (r) => r.slotKey },
  homework: { kind: "homework", key: (r) => `${r.groupId}\u0000${r.lessonId}` },
  holds: { kind: "hold", key: (r) => r.id },
};

export function createDecisionRepo(db: Database): DecisionRepo {
  const rows = (courseId: string, kind: string) =>
    (
      db
        .prepare(
          "select data from plan_decisions where course_id = ? and kind = ? order by key",
        )
        .all(courseId, kind) as { data: string }[]
    ).map((r) => JSON.parse(r.data));
  return {
    forCourse(courseId) {
      return {
        pins: rows(courseId, KINDS.pins.kind),
        merges: rows(courseId, KINDS.merges.kind),
        flexEdits: rows(courseId, KINDS.flexEdits.kind),
        coverChoices: rows(courseId, KINDS.coverChoices.kind),
        homework: rows(courseId, KINDS.homework.kind),
        holds: rows(courseId, KINDS.holds.kind),
      };
    },
    replace(courseId, kind, list) {
      const { kind: name, key } = KINDS[kind] as {
        kind: string;
        key: (row: unknown) => string;
      };
      const insert = db.prepare(
        "insert into plan_decisions (course_id, kind, key, data) values (?, ?, ?, ?)",
      );
      db.transaction(() => {
        db.prepare(
          "delete from plan_decisions where course_id = ? and kind = ?",
        ).run(courseId, name);
        for (const row of list)
          insert.run(courseId, name, key(row), JSON.stringify(row));
      })();
    },
  };
}
