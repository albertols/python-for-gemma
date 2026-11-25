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

const scheme = syntheticScheme("ial-business-u4");
const undated = {
  ...(scheme.find((i) => i.id === "a-ch2") as (typeof scheme)[number]),
  id: "a-mock",
  title: "Mock",
};
const names = namesFrom(
  [
    ...scheme,
    {
      ...undated,
      assessment: undated.assessment && { ...undated.assessment, date: null },
    },
  ],
  [],
);
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
  slotGone: false,
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

test("a lesson past the end of a known item is named by its title, and an undated assessment has no date", () => {
  expect(
    conflictSentence(
      { kind: "position-unknown", groupId: "13 1", lessonId: "ch3#5" },
      names,
    ),
  ).toBe(
    "13 1: the position names Markets lesson 5, but Markets has 4 lessons, so nothing is planned for this group.",
  );
  expect(
    conflictSentence(
      {
        kind: "pin-lesson-unknown",
        pinId: "p1",
        groupId: "13 1",
        lessonId: "ch3#5",
        slotKey: null,
      },
      names,
    ),
  ).toBe(
    "13 1: a pin names Markets lesson 5, but Markets has 4 lessons, so the pin is not used.",
  );
  // an undated assessment is dated today in the conflict; the sentence leaves the date out
  expect(
    conflictSentence(
      {
        kind: "assessment-no-slot",
        groupId: "13 3",
        itemId: "a-mock",
        date: "2026-11-20",
      },
      names,
    ),
  ).toBe('13 3: there is no lesson left for "Mock".');
});

test("when only some groups sit an official exam, each value says which count it is", () => {
  const rows = summaryRows(null, {
    perGroup: { "11D": metrics(30, 2, false), "13 1": metrics(13, 0, true) },
  });
  expect(rows[2]).toEqual({
    label: "Lessons that do not fit",
    values: { "11D": "2", "13 1": "0 after the official exam" },
  });
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

test("lessons hit by a change come first across all groups, then the rest by group", () => {
  const entries = [
    entry({ groupId: "13 1", lessonId: "ch3#4" }),
    entry({ groupId: "13 3", lessonId: "ch3#3", hitByDisruption: true }),
    entry({ groupId: "13 1", lessonId: "ch3#3" }),
  ];
  const { hit, byGroup } = changesByGroup({ entries, changedByGroup: {} });
  expect(hit.map((e) => `${e.groupId} ${e.lessonId}`)).toEqual(["13 3 ch3#3"]);
  expect(
    byGroup.map((g) => [g.groupId, g.entries.map((e) => e.lessonId)]),
  ).toEqual([["13 1", ["ch3#4", "ch3#3"]]]);
});

test("a lesson whose slot no longer exists says so", () => {
  expect(
    changeSentence(entry({ hitByDisruption: true, slotGone: true }), names),
  ).toBe(
    "Markets 3 of 4: its lesson slot no longer exists. Monday 23 November, period 5 → Wednesday 25 November, period 2",
  );
});

test("a skipped lesson is a correction, and a changed answer says what it was and is now", () => {
  expect(
    changeSentence(
      entry({
        change: "correction",
        fromState: "assumed",
        toState: "skipped",
      }),
      names,
    ),
  ).toBe(
    "Markets 3 of 4: did not happen on Monday 23 November, period 5, now Wednesday 25 November, period 2",
  );
  expect(
    changeSentence(
      entry({
        change: "correction",
        fromState: "skipped",
        toState: "taught",
        to: null,
      }),
      names,
    ),
  ).toBe("Markets 3 of 4: Monday 23 November, period 5, Skipped → Taught");
});

test("the dialog lists the hit lessons first under their own heading, with the group", () => {
  const proposal = noChanges();
  proposal.diff = {
    entries: [
      entry({ groupId: "13 3", hitByDisruption: true, slotGone: true }),
    ],
    changedByGroup: { "13 3": 1 },
  };
  const out = renderToStaticMarkup(
    createElement(ProposalDiff, { proposal, names }),
  );
  expect(out).toContain('aria-label="Lessons that lost their slot"');
  expect(out).toContain(
    "<li>13 3, Markets 3 of 4: its lesson slot no longer exists.",
  );
  expect(out.indexOf("Lessons that lost their slot")).toBeLessThan(
    out.indexOf("Changes for 13 1"),
  );
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

function noChanges(): Proposal {
  return {
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
}

test("a proposal with no conflicts and no changes says so", () => {
  const out = renderToStaticMarkup(
    createElement(ProposalDiff, { proposal: noChanges(), names }),
  );
  expect(out).toContain("No conflicts.");
  expect(out).toContain("Nothing moves for 13 1.");
});
