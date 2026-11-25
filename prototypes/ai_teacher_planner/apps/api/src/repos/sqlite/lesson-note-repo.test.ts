import { expect, test } from "vitest";
import { migratedDb } from "../../test-support.ts";
import type { StoredMaterial } from "../ports.ts";
import { createLessonNoteRepo } from "./lesson-note-repo.ts";

const fresh = () => createLessonNoteRepo(migratedDb());
const file = (over: Partial<StoredMaterial> = {}): StoredMaterial => ({
  id: "m1",
  groupId: "13 1",
  lessonId: "ch26#2",
  name: "Case study.pdf",
  storedName: "11111111-1111-1111-1111-111111111111.pdf",
  contentType: "application/pdf",
  size: 20,
  createdAt: "2026-11-25T09:00:00.000Z",
  ...over,
});

test("a note is keyed by group and lesson, replaced on a second save, and gone when emptied", () => {
  const repo = fresh();
  repo.saveText("13 1", "ch26#2", "First", "Markets, lesson 2 of 4", "t1");
  repo.saveText("13 1", "ch26#2", "Second", "Markets, lesson 2 of 4", "t2");
  repo.saveText("13 3", "ch26#2", "Other group", "x", "t3");
  expect(repo.get("13 1", "ch26#2")).toMatchObject({
    text: "Second",
    title: "Markets, lesson 2 of 4",
    updatedAt: "t2",
    materials: [],
  });
  expect(repo.list().map((n) => `${n.groupId}/${n.lessonId}`)).toEqual([
    "13 1/ch26#2",
    "13 3/ch26#2",
  ]);
  repo.saveText("13 1", "ch26#2", "", "x", "t4");
  expect(repo.get("13 1", "ch26#2")).toBeNull();
});

test("a file makes the lesson's row, and removing the last thing in the row removes the row", () => {
  const repo = fresh();
  repo.addMaterial(file(), "Markets, lesson 2 of 4");
  expect(repo.get("13 1", "ch26#2")).toMatchObject({
    text: "",
    title: "Markets, lesson 2 of 4",
    materials: [file()],
  });
  // emptying the text keeps the row while a file is attached
  repo.saveText("13 1", "ch26#2", "", "x", "t");
  expect(repo.get("13 1", "ch26#2")?.materials).toHaveLength(1);
  expect(repo.removeMaterial("m1")).toEqual(file());
  expect(repo.get("13 1", "ch26#2")).toBeNull();
  expect(repo.removeMaterial("m1")).toBeNull();
});

test("removing a file leaves the note's text", () => {
  const repo = fresh();
  repo.saveText("13 1", "ch26#2", "Keep this", "t", "t1");
  repo.addMaterial(file(), "t");
  repo.addMaterial(
    file({ id: "m2", storedName: "22222222-2222-2222-2222-222222222222.pdf" }),
    "t",
  );
  repo.removeMaterial("m1");
  expect(repo.get("13 1", "ch26#2")).toMatchObject({
    text: "Keep this",
    materials: [{ id: "m2" }],
  });
  expect(repo.material("m2")?.name).toBe("Case study.pdf");
});
