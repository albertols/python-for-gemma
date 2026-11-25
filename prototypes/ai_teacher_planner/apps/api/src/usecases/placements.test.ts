import fs from "node:fs";
import { afterAll, expect, test } from "vitest";
import { seededRepos } from "../test-support.ts";
import { acceptPlan } from "./accept-plan.ts";
import { placementsIn } from "./placements.ts";
import { savePositions } from "./positions.ts";
import { proposePlan } from "./propose-plan.ts";

const COURSE = "ial-business-u4";
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});
const planned = async () => {
  const s = await seededRepos("m2-planned");
  dirs.push(s.dataDir);
  return s;
};
const stateOf = (
  views: { groupId: string; lessonId: string; state: string }[],
  groupId: string,
  lessonId: string,
) => views.find((v) => v.groupId === groupId && v.lessonId === lessonId)?.state;

test("on the board a logged outcome wins, a stored history state stays, and a past planned lesson is assumed", async () => {
  const { repos } = await planned();
  const head = JSON.stringify(repos.plans.head(COURSE));
  repos.facts.append([
    {
      groupId: "13 1",
      lessonId: "ch1#1",
      slotKey: "13 1|2026-10-26|5",
      outcome: "taught",
      recordedOn: "2026-11-20",
      note: null,
    },
    {
      groupId: "13 1",
      lessonId: "ch1#2",
      slotKey: "13 1|2026-10-28|2",
      outcome: "skipped",
      recordedOn: "2026-11-20",
      note: "Fire drill",
    },
    // no slot: it is the lesson's placement on or before the day she recorded it
    {
      groupId: "13 3",
      lessonId: "ch1#1",
      slotKey: null,
      outcome: "cover",
      recordedOn: "2026-10-28",
      note: null,
    },
    // a later answer for the same lesson replaces the first
    {
      groupId: "13 5",
      lessonId: "ch1#1",
      slotKey: "13 5|2026-10-26|6",
      outcome: "skipped",
      recordedOn: "2026-11-19",
      note: null,
    },
    {
      groupId: "13 5",
      lessonId: "ch1#1",
      slotKey: "13 5|2026-10-26|6",
      outcome: "homework",
      recordedOn: "2026-11-20",
      note: null,
    },
  ]);
  const { placements } = placementsIn(
    repos,
    "2026-10-26",
    "2026-10-30",
    "2026-11-20",
  );
  expect(stateOf(placements, "13 1", "ch1#1")).toBe("taught");
  expect(stateOf(placements, "13 1", "ch1#2")).toBe("skipped");
  expect(stateOf(placements, "13 3", "ch1#1")).toBe("cover");
  expect(stateOf(placements, "13 5", "ch1#1")).toBe("homework");
  expect(stateOf(placements, "13 1", "ch1#3")).toBe("assumed");
  expect(stateOf(placements, "13 3", "ch1#2")).toBe("assumed");
  // today and later: as planned
  const ahead = placementsIn(repos, "2026-11-20", "2026-11-27", "2026-11-20");
  expect(ahead.placements.every((p) => p.state === "planned")).toBe(true);
  expect(stateOf(ahead.placements, "13 1", "ch3#2")).toBe("planned");
  // the head is never changed by what is shown
  expect(JSON.stringify(repos.plans.head(COURSE))).toBe(head);
});

test("a past spare lesson she did not edit is not shown, and one she edited is assumed", async () => {
  const { repos } = await planned();
  repos.decisions.replace(COURSE, "flexEdits", [
    {
      flexId: "flex:13 1:cp:a-ch3#1",
      title: "Past paper",
      purpose: "exam-practice",
    },
  ]);
  const { placements } = placementsIn(
    repos,
    "2026-11-23",
    "2026-12-11",
    "2026-12-09",
  );
  const spare = placements
    .filter((p) => p.kind === "flex")
    .map((p) => [p.lessonId, p.date, p.state, p.title]);
  expect(spare).toEqual([
    // 13 3 on 26 Nov and 13 1 on 7 Dec are past and unedited: not shown
    ["flex:13 1:cp:a-ch3#1", "2026-12-04", "assumed", "Past paper"],
    // today is 9 Dec: today's spare lesson is still ahead of her
    ["flex:13 1:cp:a-ch3#3", "2026-12-09", "planned", "Spare lesson"],
    ["flex:13 3:cp:a-ch3#1", "2026-12-10", "planned", "Spare lesson"],
    ["flex:13 3:cp:a-ch3#2", "2026-12-10", "planned", "Spare lesson"],
    ["flex:13 5:cp:a-ch3#2", "2026-12-10", "planned", "Spare lesson"],
    ["flex:13 5:cp:block:T1b#1", "2026-12-11", "planned", "Spare lesson"],
    ["flex:13 1:cp:block:T1b#1", "2026-12-11", "planned", "Spare lesson"],
  ]);
});

test("a spare lesson carries the purpose she gave it; a content lesson has none", async () => {
  const { repos } = await planned();
  repos.decisions.replace(COURSE, "flexEdits", [
    { flexId: "flex:13 3:cp:a-ch2#1", title: null, purpose: "support" },
  ]);
  const { placements } = placementsIn(
    repos,
    "2026-11-26",
    "2026-11-26",
    "2026-11-20",
  );
  const purposeOf = (lessonId: string) =>
    placements.find((p) => p.lessonId === lessonId)?.purpose;
  expect(purposeOf("flex:13 3:cp:a-ch2#1")).toBe("support");
  expect(purposeOf("ch3#4")).toBeNull();
});

test("the topics declared before each group's position are listed with the date she gave it", async () => {
  const s = await seededRepos("m2-no-positions");
  dirs.push(s.dataDir);
  const { repos, packs } = s;
  const today = "2026-11-20";
  savePositions(
    repos,
    COURSE,
    ["13 1", "13 3", "13 5"].map((groupId) => ({
      groupId,
      nextLessonId: "ch2#1",
      // 13 1 taught Prices out of order
      doneItemIds: groupId === "13 1" ? ["ch4"] : [],
      asOf: today,
    })),
  );
  const proposal = proposePlan(repos, packs, COURSE, today);
  acceptPlan(
    repos,
    packs,
    COURSE,
    today,
    { baseRevisionId: null, candidateKey: proposal.candidateKey },
    { id: "r:test", createdAt: "2026-11-20T09:00:00Z" },
  );
  const { declared } = placementsIn(repos, "2026-11-16", "2026-11-29", today);
  expect(declared).toEqual([
    {
      courseId: COURSE,
      groupId: "13 1",
      before: today,
      topics: ["Demand", "Prices"],
    },
    { courseId: COURSE, groupId: "13 3", before: today, topics: ["Demand"] },
    { courseId: COURSE, groupId: "13 5", before: today, topics: ["Demand"] },
  ]);
});

test("a group whose position declares nothing has no declared band", async () => {
  const { repos } = await planned();
  expect(
    placementsIn(repos, "2026-11-16", "2026-11-29", "2026-11-20").declared,
  ).toEqual([]);
});
