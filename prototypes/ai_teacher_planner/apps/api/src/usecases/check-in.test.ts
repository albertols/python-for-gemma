import fs from "node:fs";
import { afterAll, expect, test } from "vitest";
import { seededRepos } from "../test-support.ts";
import { acceptPlan } from "./accept-plan.ts";
import { checkInWeeks, recordCheckIn } from "./check-in.ts";
import { placementsIn } from "./placements.ts";
import { planStatus, proposePlan } from "./propose-plan.ts";

const COURSE = "ial-business-u4";
const TODAY = "2026-11-20";
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});
const planned = async () => {
  const s = await seededRepos("m2-planned");
  dirs.push(s.dataDir);
  return s;
};
/** What the board shows for one lesson on one day. */
const shown = (
  repos: Awaited<ReturnType<typeof planned>>["repos"],
  groupId: string,
  lessonId: string,
  date: string,
) =>
  placementsIn(repos, date, date, TODAY).placements.find(
    (p) => p.groupId === groupId && p.lessonId === lessonId,
  )?.state;

test("a group's whole week is confirmed with one answer per lesson, and the week leaves the check-in", async () => {
  const { repos, packs } = await planned();
  const [first] = checkInWeeks(repos, packs, TODAY);
  expect(first?.weekOf).toBe("2026-10-26");
  const mine = (first?.lessons ?? []).filter((l) => l.groupId === "13 1");
  expect(mine.length).toBeGreaterThan(0);
  const done = recordCheckIn(
    repos,
    packs,
    TODAY,
    mine.map((l) => ({
      groupId: l.groupId,
      lessonId: l.lessonId,
      outcome: "taught" as const,
      note: null,
    })),
  );
  expect(done).toEqual({ written: mine.length, outOfDate: [] });
  const after = checkInWeeks(repos, packs, TODAY)[0];
  expect(after?.weekOf).toBe("2026-10-26");
  expect(after?.lessons.some((l) => l.groupId === "13 1")).toBe(false);
  expect(after?.lessons.some((l) => l.groupId === "13 3")).toBe(true);
  for (const l of mine)
    expect(shown(repos, l.groupId, l.lessonId, l.date)).toBe("taught");
});

test("a changed answer is the latest log entry: the board and the next plan use it, on the same day too", async () => {
  const { repos, packs } = await planned();
  const lesson = checkInWeeks(repos, packs, TODAY)[0]?.lessons.find(
    (l) => l.groupId === "13 1",
  );
  if (!lesson) throw new Error("13 1 has a lesson to check in");
  const { groupId, lessonId, slotKey, date } = lesson;
  const answer = (outcome: "taught" | "skipped", recordedOn = TODAY) =>
    repos.facts.append([
      { groupId, lessonId, slotKey, outcome, recordedOn, note: null },
    ]);

  // she confirms it, then says "actually that one was skipped", the same day
  answer("taught");
  answer("skipped");
  expect(shown(repos, groupId, lessonId, date)).toBe("skipped");
  const plannedAgain = (state: string) =>
    proposePlan(repos, packs, COURSE, TODAY).candidate.placements.filter(
      (p) =>
        p.groupId === groupId && p.lessonId === lessonId && p.state === state,
    );
  expect(plannedAgain("skipped")).toHaveLength(1);
  expect(plannedAgain("taught")).toHaveLength(0);
  // a skipped lesson is taught again: it has a new planned slot
  expect(plannedAgain("planned").length).toBeGreaterThan(0);

  // the plan with the skip is accepted: the skip is now in the head's history
  const accepted = proposePlan(repos, packs, COURSE, TODAY);
  acceptPlan(
    repos,
    packs,
    COURSE,
    TODAY,
    {
      baseRevisionId: accepted.baseRevisionId,
      candidateKey: accepted.candidateKey,
    },
    { id: "r:with-skip", createdAt: "2026-11-20T09:00:00Z" },
  );
  expect(repos.plans.head(COURSE)?.snapshot.placements).toContainEqual(
    expect.objectContaining({ groupId, lessonId, slotKey, state: "skipped" }),
  );

  // later she changes her mind: it was taught after all. The newer entry wins
  // over the state the head carries, on the board and in the next proposal
  answer("taught", "2026-11-23");
  expect(shown(repos, groupId, lessonId, date)).toBe("taught");
  const next = proposePlan(repos, packs, COURSE, "2026-11-23");
  const mineNow = next.candidate.placements.filter(
    (p) => p.groupId === groupId && p.lessonId === lessonId,
  );
  expect(mineNow.find((p) => p.slotKey === slotKey)?.state).toBe("taught");
  expect(mineNow.some((p) => p.state === "planned")).toBe(false);
  expect(next.diff.entries).toContainEqual(
    expect.objectContaining({
      groupId,
      lessonId,
      change: "correction",
      toState: "taught",
    }),
  );
  // and the plan on hand is no longer up to date: there is something to accept
  expect(planStatus(repos, packs, COURSE, "2026-11-23").upToDate).toBe(false);
});
