import type { GroupOverride, SowItem } from "@planner/domain";
import type { Database } from "../../db/connection.ts";
import type { SchemeRepo } from "../ports.ts";

export function createSchemeRepo(db: Database): SchemeRepo {
  return {
    items(courseId) {
      const rows = db
        .prepare(
          "select data from sow_items where course_id = ? order by item_order, id",
        )
        .all(courseId) as { data: string }[];
      return rows.map((r) => JSON.parse(r.data) as SowItem);
    },
    overrides(courseId) {
      const rows = db
        .prepare(
          "select group_id, item_id, lessons from group_overrides where course_id = ? order by group_id, item_id",
        )
        .all(courseId) as {
        group_id: string;
        item_id: string;
        lessons: number;
      }[];
      return rows.map(
        (r): GroupOverride => ({
          groupId: r.group_id,
          itemId: r.item_id,
          lessons: r.lessons,
        }),
      );
    },
    replace(courseId, items, overrides) {
      const item = db.prepare(
        "insert into sow_items (course_id, id, item_order, data) values (?, ?, ?, ?)",
      );
      const override = db.prepare(
        "insert into group_overrides (course_id, group_id, item_id, lessons) values (?, ?, ?, ?)",
      );
      db.transaction(() => {
        db.prepare("delete from sow_items where course_id = ?").run(courseId);
        db.prepare("delete from group_overrides where course_id = ?").run(
          courseId,
        );
        for (const i of items)
          item.run(courseId, i.id, i.order, JSON.stringify(i));
        for (const o of overrides)
          override.run(courseId, o.groupId, o.itemId, o.lessons);
      })();
    },
  };
}
