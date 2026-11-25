import type { ExternalExam } from "@planner/domain";
import type { Database } from "../../db/connection.ts";
import type { ExamRepo } from "../ports.ts";

interface Record_ {
  id: string;
  code: string;
  title: string;
  exam_date: string;
  session: ExternalExam["session"];
  duration_minutes: number;
  group_ids: string;
  source: string | null;
}

export function createExamRepo(db: Database): ExamRepo {
  return {
    list() {
      const records = db
        .prepare("select * from external_exams order by exam_date, code")
        .all() as Record_[];
      return records.map(
        (r): ExternalExam => ({
          id: r.id,
          code: r.code,
          title: r.title,
          date: r.exam_date,
          session: r.session,
          durationMinutes: r.duration_minutes,
          groupIds: JSON.parse(r.group_ids) as string[],
          source: r.source,
        }),
      );
    },
    upsert(e) {
      db.prepare(
        `insert into external_exams (id, code, title, exam_date, session, duration_minutes, group_ids, source)
         values (?, ?, ?, ?, ?, ?, ?, ?)
         on conflict (id) do update set code = excluded.code, title = excluded.title,
           exam_date = excluded.exam_date, session = excluded.session,
           duration_minutes = excluded.duration_minutes, group_ids = excluded.group_ids,
           source = excluded.source`,
      ).run(
        e.id,
        e.code,
        e.title,
        e.date,
        e.session,
        e.durationMinutes,
        JSON.stringify(e.groupIds),
        e.source,
      );
    },
    remove(id) {
      return (
        db.prepare("delete from external_exams where id = ?").run(id).changes >
        0
      );
    },
  };
}
