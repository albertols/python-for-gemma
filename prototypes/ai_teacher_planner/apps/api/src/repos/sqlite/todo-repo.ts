import type { TodoNote } from "@planner/domain";
import type { Database } from "../../db/connection.ts";
import type { TodoRepo } from "../ports.ts";

interface Record_ {
  id: string;
  text: string;
  scope: TodoNote["scope"];
  note_date: string;
  done: number;
  created_at: string;
}

const toNote = (r: Record_): TodoNote => ({
  id: r.id,
  text: r.text,
  scope: r.scope,
  date: r.note_date,
  done: r.done === 1,
  createdAt: r.created_at,
});

export function createTodoRepo(db: Database): TodoRepo {
  const get = (id: string) => {
    const r = db.prepare("select * from todo_notes where id = ?").get(id) as
      | Record_
      | undefined;
    return r ? toNote(r) : null;
  };
  return {
    list() {
      const records = db
        .prepare("select * from todo_notes order by created_at, id")
        .all() as Record_[];
      return records.map(toNote);
    },
    insert(n) {
      db.prepare(
        `insert into todo_notes (id, text, scope, note_date, done, created_at)
         values (?, ?, ?, ?, ?, ?)`,
      ).run(n.id, n.text, n.scope, n.date, n.done ? 1 : 0, n.createdAt);
    },
    update(id, patch) {
      db.prepare(
        `update todo_notes set text = coalesce(?, text), done = coalesce(?, done) where id = ?`,
      ).run(
        patch.text ?? null,
        patch.done === undefined ? null : patch.done ? 1 : 0,
        id,
      );
      return get(id);
    },
    remove(id) {
      return (
        db.prepare("delete from todo_notes where id = ?").run(id).changes > 0
      );
    },
  };
}
