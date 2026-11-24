import type { ExternalExam } from "@planner/domain";
import { expect, test } from "vitest";
import { migratedDb } from "../../test-support.ts";
import { createRepos } from "./index.ts";

const exam = (id: string, over: Partial<ExternalExam> = {}): ExternalExam => ({
  id,
  code: "X1",
  title: "A paper",
  date: "2027-06-01",
  session: "morning",
  durationMinutes: 90,
  groupIds: ["13 3", "13 1"],
  source: null,
  ...over,
});

test("an exam comes back as stored, listed by date then code, and a source of null stays null", () => {
  const { exams } = createRepos(migratedDb());
  expect(exams.list()).toEqual([]);
  const later = exam("b", {
    code: "X2",
    date: "2027-06-02",
    source: "https://x.test/a",
  });
  exams.upsert(later);
  exams.upsert(exam("a"));
  expect(exams.list()).toEqual([exam("a"), later]);
});
test("saving the same id replaces it; removing says whether anything went and puts nothing back", () => {
  const { exams } = createRepos(migratedDb());
  exams.upsert(exam("a"));
  exams.upsert(exam("a", { title: "Changed", groupIds: ["11D"] }));
  expect(exams.list()).toEqual([
    exam("a", { title: "Changed", groupIds: ["11D"] }),
  ]);
  expect(exams.remove("a")).toBe(true);
  expect(exams.remove("a")).toBe(false);
  expect(exams.list()).toEqual([]);
});
test("a code is kept once: two exams with one code cannot be stored", () => {
  const { exams } = createRepos(migratedDb());
  exams.upsert(exam("a"));
  expect(() => exams.upsert(exam("b"))).toThrow();
});
