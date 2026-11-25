import type { Database } from "../../db/connection.ts";
import type {
  LessonNoteRepo,
  StoredLessonNote,
  StoredMaterial,
} from "../ports.ts";

interface NoteRecord {
  group_id: string;
  lesson_id: string;
  text: string;
  lesson_title: string;
  updated_at: string;
}
interface MaterialRecord {
  id: string;
  group_id: string;
  lesson_id: string;
  original_name: string;
  stored_name: string;
  content_type: string;
  size: number;
  created_at: string;
}

const toMaterial = (r: MaterialRecord): StoredMaterial => ({
  id: r.id,
  groupId: r.group_id,
  lessonId: r.lesson_id,
  name: r.original_name,
  storedName: r.stored_name,
  contentType: r.content_type,
  size: r.size,
  createdAt: r.created_at,
});

export function createLessonNoteRepo(db: Database): LessonNoteRepo {
  const materialsOf = (groupId: string, lessonId: string) =>
    (
      db
        .prepare(
          "select * from lesson_materials where group_id = ? and lesson_id = ? order by created_at, id",
        )
        .all(groupId, lessonId) as MaterialRecord[]
    ).map(toMaterial);
  const withMaterials = (r: NoteRecord): StoredLessonNote => ({
    groupId: r.group_id,
    lessonId: r.lesson_id,
    text: r.text,
    title: r.lesson_title,
    updatedAt: r.updated_at,
    materials: materialsOf(r.group_id, r.lesson_id),
  });
  /** A row with no text and no files has no reason to exist. */
  const dropIfEmpty = (groupId: string, lessonId: string) => {
    db.prepare(
      `delete from lesson_notes where group_id = ? and lesson_id = ? and text = ''
         and not exists (select 1 from lesson_materials m where m.group_id = ? and m.lesson_id = ?)`,
    ).run(groupId, lessonId, groupId, lessonId);
  };
  return {
    get(groupId, lessonId) {
      const r = db
        .prepare(
          "select * from lesson_notes where group_id = ? and lesson_id = ?",
        )
        .get(groupId, lessonId) as NoteRecord | undefined;
      return r ? withMaterials(r) : null;
    },
    list() {
      return (
        db
          .prepare("select * from lesson_notes order by group_id, lesson_id")
          .all() as NoteRecord[]
      ).map(withMaterials);
    },
    saveText(groupId, lessonId, text, title, now) {
      db.transaction(() => {
        db.prepare(
          `insert into lesson_notes (group_id, lesson_id, text, lesson_title, updated_at)
           values (?, ?, ?, ?, ?)
           on conflict (group_id, lesson_id)
           do update set text = excluded.text, lesson_title = excluded.lesson_title, updated_at = excluded.updated_at`,
        ).run(groupId, lessonId, text, title, now);
        dropIfEmpty(groupId, lessonId);
      })();
    },
    addMaterial(m, title) {
      db.transaction(() => {
        db.prepare(
          `insert or ignore into lesson_notes (group_id, lesson_id, text, lesson_title, updated_at)
           values (?, ?, '', ?, ?)`,
        ).run(m.groupId, m.lessonId, title, m.createdAt);
        db.prepare(
          `insert into lesson_materials
             (id, group_id, lesson_id, original_name, stored_name, content_type, size, created_at)
           values (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          m.id,
          m.groupId,
          m.lessonId,
          m.name,
          m.storedName,
          m.contentType,
          m.size,
          m.createdAt,
        );
      })();
    },
    material(id) {
      const r = db
        .prepare("select * from lesson_materials where id = ?")
        .get(id) as MaterialRecord | undefined;
      return r ? toMaterial(r) : null;
    },
    storedNames() {
      return (
        db.prepare("select stored_name from lesson_materials").all() as {
          stored_name: string;
        }[]
      ).map((r) => r.stored_name);
    },
    removeMaterial(id) {
      return db.transaction(() => {
        const r = db
          .prepare("select * from lesson_materials where id = ?")
          .get(id) as MaterialRecord | undefined;
        if (!r) return null;
        db.prepare("delete from lesson_materials where id = ?").run(id);
        dropIfEmpty(r.group_id, r.lesson_id);
        return toMaterial(r);
      })();
    },
  };
}
