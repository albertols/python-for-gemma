import { syntheticPack } from "@planner/fixtures";
import { expect, test } from "vitest";
import { curriculumPackSchema } from "./schema.ts";

test("the synthetic pack passes the schema unchanged", () => {
  const pack = syntheticPack();
  expect(curriculumPackSchema.parse(pack)).toEqual(pack);
});

test("the schema refuses an unknown level", () => {
  const pack = syntheticPack();
  const [p, ...rest] = pack.specPoints;
  if (!p) throw new Error("fixture has points");
  const bad = { ...pack, specPoints: [{ ...p, level: "extension" }, ...rest] };
  expect(curriculumPackSchema.safeParse(bad).success).toBe(false);
});

test("the schema refuses a chapter with no page field", () => {
  const pack = syntheticPack();
  const [c, ...rest] = pack.chapters;
  if (!c) throw new Error("fixture has chapters");
  const { page: _page, ...noPage } = c;
  const bad = { ...pack, chapters: [noPage, ...rest] };
  expect(curriculumPackSchema.safeParse(bad).success).toBe(false);
});

test("a null page is fine, and a wrong schema version is refused", () => {
  const pack = syntheticPack();
  const [c, ...rest] = pack.chapters;
  if (!c) throw new Error("fixture has chapters");
  expect(
    curriculumPackSchema.safeParse({
      ...pack,
      chapters: [{ ...c, page: null }, ...rest],
    }).success,
  ).toBe(true);
  expect(
    curriculumPackSchema.safeParse({ ...pack, schemaVersion: 2 }).success,
  ).toBe(false);
});
