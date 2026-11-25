import type {
  Conflict,
  PlanDiffEntry,
  PlanMetrics,
  Proposal,
} from "@planner/domain";
import { syntheticScheme } from "@planner/fixtures";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import {
  changeSentence,
  changesByGroup,
  conflictSentence,
  namesFrom,
  ProposalDiff,
  summaryRows,
} from "./ProposalDiff.tsx";

const names = namesFrom(syntheticScheme("ial-business-u4"), []);
const metrics = (
  placed: number,
  overflow: number,
  exam: boolean,
): PlanMetrics["perGroup"][string] => ({
  placed,
  spare: 4,
  overflow,
  lastContentDate: "2026-12-02",
  officialExam: exam ? { code: "WBS14 01", date: "2027-06-01" } : null,
});
const entry = (over: Partial<PlanDiffEntry>): PlanDiffEntry => ({
  groupId: "13 1",
  lessonId: "ch3#3",
  change: "moved",
  from: "13 1|2026-11-23|5",
  to: "13 1|2026-11-25|2",
  fromState: "planned",
  toState: "planned",
  hitByDisruption: false,
  ...over,
});

test("every kind of conflict is one plain sentence naming the group and the lesson", () => {
  const cases: [Conflict, string][] = [
    [
      {
        kind: "assessment-no-slot",
        groupId: "13 3",
        itemId: "a-ch2",
        date: "2026-11-27",
      },
      '13 3: there is no lesson left for "20 mark" on 27 November 2026.',
    ],
    [
      { kind: "position-unknown", groupId: "13 1", lessonId: "ch9#1" },
      '13 1: the position names "ch9#1", which is not in the scheme, so nothing is planned for this group.',
    ],
    [
      {
        kind: "pin-lesson-unknown",
        pinId: "p1",
        groupId: "13 1",
        lessonId: "ch9#1",
        slotKey: null,
      },
      '13 1: a pin names "ch9#1", which is not in the scheme, so the pin is not used.',
    ],
    [
      {
        kind: "pin-frozen",
        pinId: "p1",
        groupId: "13 1",
        lessonId: "ch3#3",
        slotKey: "13 1|2026-11-25|2",
      },
      "13 1, Markets 3 of 4: This lesson is in the next two teaching days, so it stays where it is.",
    ],
    [
      {
        kind: "anchor-frozen",
        groupId: "13 5",
        itemId: "a-ch2",
        date: "2026-11-30",
        slotKey: "13 5|2026-11-27|4",
      },
      "13 5, 20 mark: This assessment is in the next two teaching days, so it stays where it is.",
    ],
    [
      {
        kind: "pin-slot-unavailable",
        pinId: "p1",
        groupId: "13 1",
        lessonId: "ch3#3",
        slotKey: "13 1|2026-11-23|5",
      },
      "13 1: Markets 3 of 4 is pinned to Monday 23 November, period 5, which has no lesson now.",
    ],
    [
      {
        kind: "not-after-missed",
        pinId: "p1",
        groupId: "13 1",
        lessonId: "ch3#3",
        date: "2026-11-24",
        plannedDate: "2026-11-25",
      },
      "13 1: Markets 3 of 4 should be taught by 24 November 2026 but is planned for 25 November 2026.",
    ],
    [
      {
        kind: "not-after-missed",
        pinId: "p1",
        groupId: "13 1",
        lessonId: "ch3#3",
        date: "2026-11-24",
        plannedDate: null,
      },
      "13 1: Markets 3 of 4 should be taught by 24 November 2026 but does not fit in the plan.",
    ],
    [
      {
        kind: "hl-prerequisite",
        groupId: "13 1",
        lessonId: "ch3#3",
        prerequisiteItemId: "ch2",
        finishesOn: "2026-12-01",
      },
      '13 1: Markets 3 of 4 needs "Supply" first, which finishes on 1 December 2026.',
    ],
  ];
  for (const [conflict, sentence] of cases)
    expect(conflictSentence(conflict, names)).toBe(sentence);
});

test("the summary says lessons after the official exam when there is one, and do not fit when there is none", () => {
  const before: PlanMetrics = {
    perGroup: { "13 1": metrics(12, 1, true), "13 3": metrics(13, 0, true) },
  };
  const after: PlanMetrics = {
    perGroup: { "13 1": metrics(13, 0, true), "13 3": metrics(13, 0, true) },
  };
  expect(summaryRows(before, after)).toEqual([
    { label: "Lessons placed", values: { "13 1": "12 → 13", "13 3": "13" } },
    { label: "Spare lessons", values: { "13 1": "4", "13 3": "4" } },
    {
      label: "Lessons after the official exam",
      values: { "13 1": "1 → 0", "13 3": "0" },
    },
    {
      label: "Last content lesson",
      values: { "13 1": "2 December 2026", "13 3": "2 December 2026" },
    },
    {
      label: "Official exam",
      values: {
        "13 1": "WBS14 01 on 1 June 2027",
        "13 3": "WBS14 01 on 1 June 2027",
      },
    },
  ]);
  const first = summaryRows(null, {
    perGroup: { "11D": metrics(30, 2, false) },
  });
  expect(first[2]).toEqual({
    label: "Lessons that do not fit",
    values: { "11D": "2" },
  });
  expect(first[4]).toEqual({
    label: "Official exam",
    values: { "11D": "None" },
  });
});

test("changes are grouped by group, with lessons hit by a disruption first", () => {
  const entries = [
    entry({ groupId: "13 3", lessonId: "ch3#3" }),
    entry({ lessonId: "ch3#4" }),
    entry({ lessonId: "ch3#3", hitByDisruption: true }),
  ];
  expect(
    changesByGroup({ entries, changedByGroup: {} }).map((g) => [
      g.groupId,
      g.entries.map((e) => e.lessonId),
    ]),
  ).toEqual([
    ["13 1", ["ch3#3", "ch3#4"]],
    ["13 3", ["ch3#3"]],
  ]);
});

test("a change gives the old and the new date", () => {
  expect(changeSentence(entry({ hitByDisruption: true }), names)).toBe(
    "Markets 3 of 4: its lesson was cancelled. Monday 23 November, period 5 → Wednesday 25 November, period 2",
  );
  expect(changeSentence(entry({ change: "added", from: null }), names)).toBe(
    "Markets 3 of 4: new, Wednesday 25 November, period 2",
  );
  expect(changeSentence(entry({ change: "removed", to: null }), names)).toBe(
    "Markets 3 of 4: Monday 23 November, period 5 → does not fit",
  );
});

test("a proposal with no conflicts and no changes says so", () => {
  const proposal: Proposal = {
    planId: "ial-business-u4",
    baseRevisionId: null,
    label: "First plan",
    candidate: {
      courseId: "ial-business-u4",
      today: "2026-11-20",
      placements: [],
      assessments: [],
      checkpoints: [],
      overflow: [],
      absorbed: [],
      conflicts: [],
    },
    diff: { entries: [], changedByGroup: { "13 1": 0 } },
    before: null,
    after: { perGroup: { "13 1": metrics(13, 0, true) } },
    conflicts: [],
  };
  const out = renderToStaticMarkup(
    createElement(ProposalDiff, { proposal, names }),
  );
  expect(out).toContain("No conflicts.");
  expect(out).toContain("Nothing moves for 13 1.");
});
