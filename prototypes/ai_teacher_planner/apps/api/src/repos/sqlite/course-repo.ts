import type { Course } from "@planner/domain";
import type { Database } from "../../db/connection.ts";
import type { CourseRepo } from "../ports.ts";

interface Record_ {
  id: string;
  title: string;
  board: Course["board"];
  revision_weeks: number;
}
const toCourse = (r: Record_): Course => ({
  id: r.id,
  title: r.title,
  board: r.board,
  revisionWeeks: r.revision_weeks,
});

export function createCourseRepo(db: Database): CourseRepo {
  return {
    list() {
      return (
        db.prepare("select * from courses order by id").all() as Record_[]
      ).map(toCourse);
    },
    get(id) {
      const r = db.prepare("select * from courses where id = ?").get(id) as
        | Record_
        | undefined;
      return r ? toCourse(r) : null;
    },
    seed(courses) {
      const insert = db.prepare(
        "insert into courses (id, title, board, revision_weeks) values (?, ?, ?, ?) on conflict (id) do nothing",
      );
      db.transaction(() => {
        for (const c of courses)
          insert.run(c.id, c.title, c.board, c.revisionWeeks);
      })();
    },
    setRevisionWeeks(id, weeks) {
      return (
        db
          .prepare("update courses set revision_weeks = ? where id = ?")
          .run(weeks, id).changes > 0
      );
    },
  };
}
