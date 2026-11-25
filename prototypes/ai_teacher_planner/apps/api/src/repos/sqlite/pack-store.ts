import fs from "node:fs";
import path from "node:path";
import type { CourseId, CurriculumPack } from "@planner/domain";
import { curriculumPackSchema } from "@planner/importers";
import type { Database } from "../../db/connection.ts";
import type { PackStore } from "../ports.ts";

/** Course ids are slugs; anything else could name a file outside the folder. */
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** Pack files in `dir`, and each locked pack's hash in the database. Nothing is written until a save. */
export function createPackStore(db: Database, dir: string): PackStore {
  const file = (courseId: CourseId, draft: boolean) => {
    if (!SLUG.test(courseId))
      throw new Error(`"${courseId}" is not a course id`);
    return path.join(dir, `${courseId}${draft ? ".draft" : ""}.json`);
  };
  const read = (p: string): CurriculumPack | null => {
    if (!fs.existsSync(p)) return null;
    return curriculumPackSchema.parse(JSON.parse(fs.readFileSync(p, "utf8")));
  };
  const write = (p: string, pack: CurriculumPack) => {
    fs.mkdirSync(dir, { recursive: true });
    // written beside it, then renamed, so a crash never leaves half a pack
    fs.writeFileSync(`${p}.tmp`, `${JSON.stringify(pack, null, 2)}\n`);
    fs.renameSync(`${p}.tmp`, p);
  };
  return {
    draft: (courseId) => read(file(courseId, true)),
    locked(courseId) {
      const row = db
        .prepare("select hash from pack_locks where course_id = ?")
        .get(courseId) as { hash: string } | undefined;
      const pack = read(file(courseId, false));
      if (!row || !pack || pack.lockedAt === null || pack.hash !== row.hash)
        return null;
      return pack;
    },
    saveDraft(pack) {
      write(file(pack.courseId, true), { ...pack, lockedAt: null, hash: null });
    },
    saveLocked(pack) {
      if (pack.lockedAt === null || pack.hash === null)
        throw new Error("Only a locked pack can be saved as locked.");
      db.transaction(() => {
        db.prepare(
          `insert into pack_locks (course_id, hash, locked_at) values (?, ?, ?)
           on conflict (course_id) do update set hash = excluded.hash, locked_at = excluded.locked_at`,
        ).run(pack.courseId, pack.hash, pack.lockedAt);
        write(file(pack.courseId, false), pack);
      })();
    },
    clear() {
      if (!fs.existsSync(dir)) return;
      for (const name of fs.readdirSync(dir))
        fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    },
  };
}
