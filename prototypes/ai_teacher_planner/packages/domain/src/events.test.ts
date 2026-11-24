import {
  SEED_GROUPS,
  SEED_TIMETABLE,
  SYNTHETIC_TERMS,
  syntheticRows,
} from "@planner/fixtures";
import { expect, test } from "vitest";
import {
  type CalendarRow,
  toCalendarDays,
  type YearGroup,
} from "./calendar.ts";
import {
  classificationConflicts,
  disruptionsFromEvents,
  type EventCandidate,
  type EventClassification,
  eventCandidates,
  lessonsHitBy,
  possibleDisruptions,
  possibleTextsFor,
  presortOf,
  staleClassifications,
  wordingKey,
} from "./events.ts";
import { buildSlots, type Slot } from "./slots.ts";

const rows = syntheticRows();
const days = toCalendarDays(rows, SYNTHETIC_TERMS);
const base = {
  days,
  timetables: [SEED_TIMETABLE],
  groups: SEED_GROUPS,
};
const plain = buildSlots({ ...base, disruptions: [] });
const candidates = eventCandidates({
  rows,
  days,
  groups: SEED_GROUPS,
  slots: plain,
});
const candidate = (key: string, year: YearGroup | null) =>
  candidates.find((c) => c.wordingKey === key && c.yearGroup === year);

const MOCK_WEEK = [
  "2027-01-11",
  "2027-01-12",
  "2027-01-13",
  "2027-01-14",
  "2027-01-15",
];
const classification = (
  over: Partial<EventClassification>,
): EventClassification => ({
  id: "c1",
  wordingKey: "mock exams",
  yearGroup: 13,
  onlyDates: null,
  decision: "cancels",
  groupIds: null,
  periods: null,
  until: null,
  provenance: "teacher",
  ...over,
});
const confirmMocksY13 = classification({});
const statusOn = (slots: Slot[], group: string, date: string) =>
  slots.find((s) => s.groupId === group && s.date === date)?.status;
const reasonOn = (slots: Slot[], group: string, date: string) =>
  slots
    .find((s) => s.groupId === group && s.date === date)
    ?.reasons.map((r) => r.text)
    .join(";");
const withEvents = (cs: EventClassification[]) =>
  buildSlots({
    ...base,
    disruptions: disruptionsFromEvents(candidates, cs, SEED_GROUPS),
  });

test("wording keys are lower case with runs of spaces collapsed, digits kept", () => {
  expect(wordingKey("  Mock   Exams (P1-4) ")).toBe("mock exams (p1-4)");
  expect(wordingKey("Year 13\tMock")).toBe("year 13 mock");
});

test("the mock week is one Year 13 candidate with five dates, pre-sorted as cancels", () =>
  expect(candidate("mock exams", 13)).toMatchObject({
    dates: MOCK_WEEK,
    text: "Mock exams",
    column: "events",
    presort: { category: "mock-exams", suggestion: "cancels" },
  }));

test("Year 11 keeps only the dates on which she has a Year 11 lesson", () =>
  expect(candidate("mock exams", 11)?.dates).toEqual(["2027-01-12"]));

test("the Year 12 trip is unsure", () =>
  expect(candidate("geography trip", 12)?.presort.suggestion).toBe("unsure"));

test("the staff training day inside term is a whole-school candidate", () =>
  expect(candidate("staff training day", null)).toMatchObject({
    dates: ["2027-05-04"],
    column: "secondary",
    presort: { suggestion: "cancels" },
  }));

test("the staff days before term are not candidates, because there are no slots then", () =>
  expect(candidate("staff training", null)).toBeUndefined());

test("study leave starts twice in term as a whole-school candidate", () =>
  expect(candidate("study leave starts", null)).toMatchObject({
    dates: ["2027-05-05", "2027-05-11"],
    presort: { category: "study-leave", suggestion: "cancels" },
  }));

test("an event for a year she does not teach is not a candidate", () => {
  const one: CalendarRow = {
    ...(rows.find((r) => r.date === "2027-01-12") as CalendarRow),
    byYear: {
      9: {
        events: "Year 9 camp",
        communication: null,
        assessments: null,
        assessmentsALevel: null,
        assessmentsIb: null,
      },
    },
  };
  const found = eventCandidates({
    rows: [one],
    days,
    groups: SEED_GROUPS,
    slots: plain,
  });
  expect(found.some((c) => c.text === "Year 9 camp")).toBe(false);
});

test("a two-line cell gives two candidates", () => {
  const row = rows.find((r) => r.date === "2027-01-12") as CalendarRow;
  const found = eventCandidates({
    rows: [
      {
        ...row,
        byYear: {
          13: {
            events: "Careers talk\nUCAS deadline",
            communication: null,
            assessments: null,
            assessmentsALevel: null,
            assessmentsIb: null,
          },
        },
      },
    ],
    days,
    groups: SEED_GROUPS,
    slots: plain,
  });
  expect(found.map((c) => c.text).sort()).toEqual([
    "Careers talk",
    "UCAS deadline",
  ]);
});

test("Year 12 reads the IB assessments cell, Year 13 the A level one, Year 11 the plain one", () => {
  const row = rows.find((r) => r.date === "2027-03-04") as CalendarRow;
  const cell = (text: string) => ({
    events: null,
    communication: null,
    assessments: `plain ${text}`,
    assessmentsALevel: `alevel ${text}`,
    assessmentsIb: `ib ${text}`,
  });
  const found = eventCandidates({
    rows: [{ ...row, byYear: { 11: cell("a"), 12: cell("b"), 13: cell("c") } }],
    days,
    groups: SEED_GROUPS,
    slots: plain,
  });
  const byYear = (y: number) =>
    found.filter((c) => c.yearGroup === y).map((c) => c.text);
  // Her groups on 2027-03-04 are Year 12 and Year 13 only, so Year 11 has no date left.
  expect(byYear(12)).toEqual(["ib b"]);
  expect(byYear(13)).toEqual(["alevel c"]);
  expect(byYear(11)).toEqual([]);
  expect(found.find((c) => c.text === "ib b")?.column).toBe("assessments");
});

test("a date still counts after a lesson on it is cancelled, so one confirmation does not hide another", () => {
  const staffDay = classification({
    id: "s",
    wordingKey: "staff training day",
    yearGroup: null,
  });
  const cancelled = withEvents([staffDay]);
  const again = eventCandidates({
    rows,
    days,
    groups: SEED_GROUPS,
    slots: cancelled,
  });
  expect(again).toEqual(candidates);
});

test("nothing is cancelled until she confirms", () => {
  expect(disruptionsFromEvents(candidates, [], SEED_GROUPS)).toEqual([]);
  expect(withEvents([]).every((s) => s.status === "open")).toBe(true);
});

test("confirming the mock week cancels Year 13 lessons on those five days and nobody else's", () => {
  const slots = withEvents([confirmMocksY13]);
  expect(statusOn(slots, "13 1", "2027-01-11")).toBe("cancelled");
  expect(statusOn(slots, "IB S", "2027-01-13")).toBe("open");
  expect(statusOn(slots, "11D", "2027-01-12")).toBe("open");
  expect(reasonOn(slots, "13 1", "2027-01-11")).toBe("Mock exams");
  const [first] = disruptionsFromEvents(
    candidates,
    [confirmMocksY13],
    SEED_GROUPS,
  );
  expect(first).toMatchObject({
    id: "ev:c1:2027-01-11:y13",
    scope: { kind: "year", yearGroup: 13 },
    from: "2027-01-11",
    to: "2027-01-11",
    effect: "cancelled",
    source: "calendar",
  });
});

test("a confirmation can keep some dates only and can name periods", () => {
  const slots = withEvents([
    classification({ onlyDates: ["2027-01-11", "2027-01-15"], periods: [5] }),
  ]);
  expect(statusOn(slots, "13 1", "2027-01-11")).toBe("cancelled");
  expect(statusOn(slots, "13 1", "2027-01-13")).toBe("open");
  const jan15 = slots.filter((s) => s.date === "2027-01-15");
  expect(jan15.map((s) => `${s.groupId}/${s.period}:${s.status}`)).toEqual([
    "13 5/4:open",
    "13 1/6:open",
  ]);
});

test("a date she did not keep does not turn up even if she names it", () => {
  const made = disruptionsFromEvents(
    candidates,
    [classification({ onlyDates: ["2027-01-11", "2027-02-01"] })],
    SEED_GROUPS,
  );
  expect(made.map((d) => d.from)).toEqual(["2027-01-11"]);
});

test("a confirmed 'no effect' cancels nothing", () => {
  const none = classification({ decision: "no-effect" });
  expect(disruptionsFromEvents(candidates, [none], SEED_GROUPS)).toEqual([]);
});

test("an unconfirmed candidate is a possible disruption on each date; a confirmed 'no effect' is not", () => {
  const all = possibleDisruptions(candidates, []);
  expect(
    all.filter((p) => p.text === "Mock exams" && p.yearGroup === 13),
  ).toHaveLength(5);
  const after = possibleDisruptions(candidates, [
    classification({ decision: "no-effect" }),
  ]);
  expect(after.some((p) => p.text === "Mock exams" && p.yearGroup === 13)).toBe(
    false,
  );
  expect(after.some((p) => p.text === "Mock exams" && p.yearGroup === 11)).toBe(
    true,
  );
});

test("a confirmation of some dates leaves the other dates possible", () => {
  const after = possibleDisruptions(candidates, [
    classification({ onlyDates: ["2027-01-11"] }),
  ]);
  expect(
    after
      .filter((p) => p.text === "Mock exams" && p.yearGroup === 13)
      .map((p) => p.date),
  ).toEqual(MOCK_WEEK.slice(1));
});

test("a changed wording is a new candidate and the old confirmation does not apply to it", () => {
  const row = rows.find((r) => r.date === "2027-01-11") as CalendarRow;
  const changed = eventCandidates({
    rows: [
      {
        ...row,
        byYear: {
          13: {
            events: "Mock exams (P1-4)",
            communication: null,
            assessments: null,
            assessmentsALevel: null,
            assessmentsIb: null,
          },
        },
      },
    ],
    days,
    groups: SEED_GROUPS,
    slots: plain,
  });
  expect(changed.map((c) => c.wordingKey)).toEqual(["mock exams (p1-4)"]);
  expect(
    disruptionsFromEvents(changed, [confirmMocksY13], SEED_GROUPS),
  ).toEqual([]);
  expect(staleClassifications(changed, [confirmMocksY13])).toEqual([
    {
      classification: confirmMocksY13,
      candidateGone: true,
      missingDates: [],
    },
  ]);
});

test("a confirmed date the calendar no longer has is reported as missing", () => {
  const stale = staleClassifications(candidates, [
    classification({ onlyDates: ["2027-01-11", "2027-02-01"] }),
  ]);
  expect(stale).toHaveLength(1);
  expect(stale[0]).toMatchObject({
    candidateGone: false,
    missingDates: ["2027-02-01"],
  });
  expect(staleClassifications(candidates, [confirmMocksY13])).toEqual([]);
});

test("study leave confirmed with 'until' cancels every 13 1 slot from that date to the end", () => {
  const studyLeave = classification({
    id: "sl",
    wordingKey: "study leave starts",
    yearGroup: null,
    groupIds: ["13 1", "13 3", "13 5"],
    onlyDates: ["2027-05-05", "2027-05-11"],
    until: "2027-06-29",
  });
  const made = disruptionsFromEvents(candidates, [studyLeave], SEED_GROUPS);
  expect(made[0]).toMatchObject({
    id: "ev:sl:2027-05-05:g13 1",
    scope: { kind: "group", groupId: "13 1" },
    from: "2027-05-05",
    to: "2027-06-29",
    reason: "Study leave starts",
  });
  const slots = withEvents([studyLeave]);
  const mine = slots.filter((s) => s.groupId === "13 1");
  expect(mine.filter((s) => s.date >= "2027-05-05").length).toBeGreaterThan(0);
  expect(
    mine
      .filter((s) => s.date >= "2027-05-05")
      .every((s) => s.status === "cancelled"),
  ).toBe(true);
  expect(
    mine.filter((s) => s.date < "2027-05-05").every((s) => s.status === "open"),
  ).toBe(true);
  // Year 12 is not in the groups she chose.
  expect(
    slots
      .filter((s) => s.groupId === "IB S" && s.date >= "2027-05-05")
      .every((s) => s.status === "open"),
  ).toBe(true);
});

test("a whole-school confirmation with no groups cancels the whole school's lessons that day", () => {
  const slots = withEvents([
    classification({
      id: "st",
      wordingKey: "staff training day",
      yearGroup: null,
    }),
  ]);
  const day = slots.filter((s) => s.date === "2027-05-04");
  expect(day.length).toBeGreaterThan(0);
  expect(day.every((s) => s.status === "cancelled")).toBe(true);
  expect(day[0]?.reasons[0]?.text).toBe("Staff training day");
});

test("one wording confirmed for Year 11 on one date and Year 13 on another gives two separate disruptions", () => {
  const made = disruptionsFromEvents(
    candidates,
    [
      classification({
        id: "a",
        yearGroup: 11,
        onlyDates: ["2027-01-12"],
      }),
      classification({ id: "b", yearGroup: 13, onlyDates: ["2027-01-15"] }),
    ],
    SEED_GROUPS,
  );
  expect(made.map((d) => [d.id, d.scope])).toEqual([
    ["ev:a:2027-01-12:y11", { kind: "year", yearGroup: 11 }],
    ["ev:b:2027-01-15:y13", { kind: "year", yearGroup: 13 }],
  ]);
});

test("the same wording confirmed twice for one year on different dates is allowed", () => {
  const a = classification({ id: "a", onlyDates: ["2027-01-11"] });
  const b = classification({ id: "b", onlyDates: ["2027-01-12"] });
  expect(classificationConflicts(candidates, [a, b])).toEqual([]);
});

test("two confirmations covering the same date conflict", () => {
  const a = classification({ id: "a" });
  const b = classification({
    id: "b",
    onlyDates: ["2027-01-13", "2027-01-14"],
  });
  expect(classificationConflicts(candidates, [a, b])).toEqual([
    { a: "a", b: "b", date: "2027-01-13" },
  ]);
});

test("a confirmation for another year does not conflict", () => {
  const a = classification({ id: "a", yearGroup: 11 });
  const b = classification({ id: "b", yearGroup: 13 });
  expect(classificationConflicts(candidates, [a, b])).toEqual([]);
});

test("'Extended essay day' is pre-sorted as coursework, cancels; 'half day' as not sure", () => {
  expect(candidate("extended essay day", 12)?.presort).toMatchObject({
    category: "coursework",
    suggestion: "cancels",
  });
  expect(presortOf("Half day")).toMatchObject({
    category: "half-day",
    suggestion: "unsure",
  });
  expect(presortOf("EE deadline")).toMatchObject({ category: "coursework" });
});

test("'Employee' does not match 'ee'", () =>
  expect(presortOf("Employee talk").category).not.toBe("coursework"));

test.each([
  ["Staff only", "staff-only", "cancels"],
  ["INSET day", "staff-only", "cancels"],
  ["Closed to pupils", "staff-only", "cancels"],
  ["Study leave", "study-leave", "cancels"],
  ["Mock exams", "mock-exams", "cancels"],
  ["Official exam", "external-exam", "cancels"],
  ["External exam", "external-exam", "cancels"],
  ["Visit to the museum", "trip", "unsure"],
  ["Whole school assembly", "assembly", "unsure"],
  ["Parents meeting", "meeting", "no-effect"],
  ["Reports deadline", "meeting", "no-effect"],
  ["Something unexpected", "other", "unsure"],
])("the pre-sort puts %s in %s as %s", (text, category, suggestion) =>
  expect(presortOf(text)).toMatchObject({ category, suggestion }),
);

test("the first matching row wins: a mock that is a trip is a mock", () =>
  expect(presortOf("Mock exam trip").category).toBe("mock-exams"));

test("lessonsHitBy counts the slots the disruptions take, whatever their status", () => {
  const made = disruptionsFromEvents(
    candidates,
    [confirmMocksY13],
    SEED_GROUPS,
  );
  expect(lessonsHitBy(made, plain, SEED_GROUPS).map((s) => s.date)).toEqual(
    plain
      .filter((s) => s.groupId.startsWith("13") && MOCK_WEEK.includes(s.date))
      .map((s) => s.date),
  );
});

test("candidates are in date order, whole school before a year on the same date", () => {
  const keys = (cs: EventCandidate[]) =>
    cs.map((c) => `${c.dates[0]}|${c.yearGroup ?? 0}`);
  expect(keys(candidates)).toEqual([...keys(candidates)].sort());
});

test("a lesson is told of the possible disruptions of its date, its year and the whole school, once each", () => {
  const possible = possibleDisruptions(candidates, []);
  const yearOf = new Map(SEED_GROUPS.map((g) => [g.id, g.yearGroup]));
  const lesson = (g: string, d: string) =>
    plain.find((s) => s.groupId === g && s.date === d) as Slot;
  expect(
    possibleTextsFor(lesson("13 1", "2027-01-11"), yearOf, possible),
  ).toEqual(["Mock exams"]);
  expect(
    possibleTextsFor(lesson("IB H", "2027-01-11"), yearOf, possible),
  ).toEqual([]);
  expect(
    possibleTextsFor(lesson("13 5", "2027-05-11"), yearOf, possible),
  ).toEqual(["Study leave starts"]);
});

test("a lesson already cancelled for an event is not also called possible", () => {
  const cancelled = withEvents([confirmMocksY13]);
  const yearOf = new Map(SEED_GROUPS.map((g) => [g.id, g.yearGroup]));
  const slot = cancelled.find(
    (s) => s.groupId === "13 1" && s.date === "2027-01-11",
  ) as Slot;
  const again = possibleDisruptions(candidates, [
    classification({ onlyDates: ["2027-01-12"] }),
  ]);
  expect(possibleTextsFor(slot, yearOf, again)).toEqual([]);
});
