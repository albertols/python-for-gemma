import type {
  DutyEntry,
  Group,
  TimetableEntry,
  TimetableVersion,
} from "@planner/domain";
import type { Database } from "../../db/connection.ts";
import type { TimetableRepo } from "../ports.ts";

interface VersionRecord {
  id: string;
  valid_from: string;
  entries: string;
  duties: string;
}
interface GroupRecord {
  id: string;
  year_group: number;
  programme: Group["programme"];
  course_id: string;
  track: Group["track"];
  colour: string;
}

export function createTimetableRepo(db: Database): TimetableRepo {
  const upsertVersion = db.prepare(
    `insert into timetable_versions (id, valid_from, entries, duties) values (?, ?, ?, ?)
     on conflict (id) do update set valid_from = excluded.valid_from, entries = excluded.entries, duties = excluded.duties`,
  );
  const save = (v: TimetableVersion) =>
    upsertVersion.run(
      v.id,
      v.validFrom,
      JSON.stringify(v.entries),
      JSON.stringify(v.duties),
    );
  return {
    versions() {
      const records = db
        .prepare("select * from timetable_versions order by valid_from, id")
        .all() as VersionRecord[];
      return records.map(
        (r): TimetableVersion => ({
          id: r.id,
          validFrom: r.valid_from,
          entries: JSON.parse(r.entries) as TimetableEntry[],
          duties: JSON.parse(r.duties) as DutyEntry[],
        }),
      );
    },
    groups() {
      const records = db
        .prepare("select * from groups order by id")
        .all() as GroupRecord[];
      return records.map(
        (r): Group => ({
          id: r.id,
          yearGroup: r.year_group as Group["yearGroup"],
          programme: r.programme,
          courseId: r.course_id,
          track: r.track,
          colour: r.colour,
        }),
      );
    },
    saveVersion: save,
    seed(versions, groups) {
      db.transaction(() => {
        for (const v of versions) save(v);
        const insertGroup = db.prepare(
          "insert or ignore into groups (id, year_group, programme, course_id, track, colour) values (?, ?, ?, ?, ?, ?)",
        );
        for (const g of groups)
          insertGroup.run(
            g.id,
            g.yearGroup,
            g.programme,
            g.courseId,
            g.track,
            g.colour,
          );
      })();
    },
  };
}
