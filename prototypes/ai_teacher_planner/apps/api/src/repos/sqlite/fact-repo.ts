import type { LessonLogEntry, Position } from "@planner/domain";
import type { Database } from "../../db/connection.ts";
import type { FactRepo } from "../ports.ts";

interface PositionRecord {
  group_id: string;
  next_lesson_id: string | null;
  done_item_ids: string;
  as_of: string;
}
interface LogRecord {
  group_id: string;
  lesson_id: string;
  slot_key: string | null;
  outcome: LessonLogEntry["outcome"];
  recorded_on: string;
  note: string | null;
}

export function createFactRepo(db: Database): FactRepo {
  return {
    positions(courseId) {
      const rows = db
        .prepare(
          "select * from positions where course_id = ? order by group_id",
        )
        .all(courseId) as PositionRecord[];
      return rows.map(
        (r): Position => ({
          groupId: r.group_id,
          nextLessonId: r.next_lesson_id,
          doneItemIds: JSON.parse(r.done_item_ids) as string[],
          asOf: r.as_of,
        }),
      );
    },
    setPositions(courseId, positions) {
      const insert = db.prepare(
        `insert into positions (group_id, course_id, next_lesson_id, done_item_ids, as_of) values (?, ?, ?, ?, ?)
         on conflict (group_id) do update set course_id = excluded.course_id,
           next_lesson_id = excluded.next_lesson_id, done_item_ids = excluded.done_item_ids, as_of = excluded.as_of`,
      );
      db.transaction(() => {
        db.prepare("delete from positions where course_id = ?").run(courseId);
        for (const p of positions)
          insert.run(
            p.groupId,
            courseId,
            p.nextLessonId,
            JSON.stringify(p.doneItemIds),
            p.asOf,
          );
      })();
    },
    log(groupIds) {
      if (groupIds.length === 0) return [];
      const rows = db
        .prepare(
          `select * from lesson_log where group_id in (${groupIds.map(() => "?").join(", ")}) order by id`,
        )
        .all(...groupIds) as LogRecord[];
      return rows.map(
        (r): LessonLogEntry => ({
          groupId: r.group_id,
          lessonId: r.lesson_id,
          slotKey: r.slot_key,
          outcome: r.outcome,
          recordedOn: r.recorded_on,
          note: r.note,
        }),
      );
    },
    append(entries) {
      const insert = db.prepare(
        "insert into lesson_log (group_id, lesson_id, slot_key, outcome, recorded_on, note) values (?, ?, ?, ?, ?, ?)",
      );
      db.transaction(() => {
        for (const e of entries)
          insert.run(
            e.groupId,
            e.lessonId,
            e.slotKey,
            e.outcome,
            e.recordedOn,
            e.note,
          );
      })();
    },
  };
}
