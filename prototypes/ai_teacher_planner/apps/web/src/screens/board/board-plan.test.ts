import {
  ENGINE,
  type PlanInputs,
  type Slot,
  sequence,
  toCalendarDays,
} from "@planner/domain";
import {
  paceWorld,
  SEED_TIMETABLE,
  SYNTHETIC_TERMS,
  syntheticRows,
} from "@planner/fixtures";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { AssessmentView, PlacementView } from "../../api/queries.ts";
import { SPARE_EXPLANATION, STATE_LABEL } from "../../lib/plan-words.ts";
import { boardFor } from "./board-model.ts";
import {
  type CardModel,
  cardsFor,
  clipKey,
  declaredFor,
  withClips,
} from "./board-plan.ts";
import { SlotCell } from "./SlotCell.tsx";

const days = toCalendarDays(syntheticRows(), SYNTHETIC_TERMS);
const FORTNIGHT = { w1: "2026-11-16", w2: "2026-11-23", breakBefore: false };

/** What GET /api/placements would answer for the plan of `world`: titles are the item ids. */
function viewsOf(world: PlanInputs): {
  placements: PlacementView[];
  assessments: AssessmentView[];
} {
  const snapshot = sequence(world);
  const items = new Map(world.items.map((i) => [i.id, i]));
  const parts = (slotKey: string) => {
    const [, date = "", period = "0"] = slotKey.split("|");
    return { date, period: Number(period) };
  };
  const placements = snapshot.placements.flatMap((p): PlacementView[] => {
    if (p.slotKey === null) return [];
    const where = { courseId: world.courseId, ...parts(p.slotKey) };
    if (p.lessonId.startsWith("flex:"))
      return [
        {
          ...p,
          ...where,
          itemId: null,
          index: null,
          of: null,
          title: "Spare lesson",
          kind: "flex",
          provenance: ENGINE,
          purpose: null,
        },
      ];
    const [itemId = "", n = "0"] = p.lessonId.split("#");
    const item = items.get(itemId);
    return [
      {
        ...p,
        ...where,
        itemId,
        index: Number(n),
        of: item?.lessons ?? null,
        title: item?.title ?? itemId,
        kind: item?.kind ?? "teaching",
        provenance: item?.provenance ?? ENGINE,
        purpose: null,
      },
    ];
  });
  const assessments = snapshot.assessments.map(
    (a): AssessmentView => ({
      ...a,
      courseId: world.courseId,
      ...parts(a.slotKey),
      title: items.get(a.itemId)?.title ?? a.itemId,
      provenance: ENGINE,
    }),
  );
  return { placements, assessments };
}
const cardsOf = (world: PlanInputs) => {
  const v = viewsOf(world);
  return cardsFor(v.placements, v.assessments);
};
const planCards = cardsOf(paceWorld());
const card = (slotKey: string) => planCards.get(slotKey);
const cellAt = (
  board: ReturnType<typeof boardFor>,
  date: string,
  period: number,
) =>
  [...(board.w1?.days ?? []), ...(board.w2?.days ?? [])]
    .find((d) => d.date === date)
    ?.cells.find((c) => c.period === period);
const html = (cell: ReturnType<typeof cellAt>) => {
  if (!cell) throw new Error("no such cell");
  return renderToStaticMarkup(
    createElement(SlotCell, { cell, colour: "g1", reason: null }),
  );
};
/** The text of the element the cell's aria-describedby points at. */
function described(markup: string): string {
  const id = /aria-describedby="([^"]+)"/.exec(markup)?.[1];
  if (!id) return "";
  const at = markup.indexOf(`id="${id}"`);
  const open = markup.indexOf(">", at) + 1;
  return markup.slice(open, markup.indexOf("</span>", open));
}

test("an in-lesson assessment is a chip on the lesson's card, a whole-slot one is its own card", () => {
  // a1 is whole-slot: 13 1 sits it on Friday 27 November, period 6, and no lesson is there
  expect(card("13 1|2026-11-27|6")).toMatchObject({
    kind: "assessment",
    title: "a1",
    lessonIds: [],
    assessment: { title: "a1", slotUse: "whole" },
  });
  const world = paceWorld();
  world.items = world.items.map((i) =>
    i.assessment
      ? { ...i, assessment: { ...i.assessment, slotUse: "in-lesson" as const } }
      : i,
  );
  const v = viewsOf(world);
  const at = v.assessments.find((a) => a.groupId === "13 1")?.slotKey ?? "";
  const lesson = v.placements.find((p) => p.slotKey === at);
  expect(lesson?.kind).toBe("teaching");
  const onLesson = cardsFor(v.placements, v.assessments).get(at);
  expect(onLesson).toMatchObject({
    kind: "teaching",
    title: lesson?.title,
    lessonIds: [lesson?.lessonId],
    assessment: { title: "a1", slotUse: "in-lesson" },
  });
});

test("a spare lesson's card says Spare lesson", () =>
  expect(card("13 3|2026-11-26|4")).toMatchObject({
    kind: "flex",
    title: "Spare lesson",
  }));

test("a content lesson's card names the item and which lesson of it this is", () => {
  const first = [...planCards.values()].filter(
    (c) => c.groupId === "13 1" && c.lessonIds.includes("c1#1"),
  );
  expect(first).toHaveLength(1);
  expect(first[0]).toMatchObject({
    kind: "teaching",
    title: "c1",
    sub: "1 of 3",
    state: "planned",
    lessonIds: ["c1#1"],
  });
  expect(first[0]?.slotKey.startsWith("13 1|2026-11-09|")).toBe(true);
});

test("a merged pair is one card naming both lessons", () => {
  const world = paceWorld();
  world.merges = [{ id: "m1", groupId: "13 1", first: "c1#2", second: "c1#3" }];
  const cards = [...cardsOf(world).values()].filter(
    (c) => c.groupId === "13 1" && c.lessonIds.includes("c1#3"),
  );
  expect(cards).toHaveLength(1);
  expect(cards[0]).toMatchObject({
    title: "c1",
    sub: "2 and 3 of 3",
    lessonIds: ["c1#2", "c1#3"],
  });
});

test("a double joins only when both periods hold the same card, or both hold none", () => {
  // 13 3's double on Thursday 19 November, periods 3 and 4
  const { slots } = paceWorld();
  const at = (cards: ReadonlyMap<string, CardModel> | undefined) =>
    cellAt(
      boardFor(FORTNIGHT, days, slots, [SEED_TIMETABLE], () => [], { cards }),
      "2026-11-19",
      3,
    );
  expect(at(undefined)?.joinsNext).toBe(true);
  expect(at(new Map())?.joinsNext).toBe(true);
  // the plan puts two different lessons there
  const p3 = planCards.get("13 3|2026-11-19|3");
  const p4 = planCards.get("13 3|2026-11-19|4");
  expect(p3?.lessonIds).not.toEqual(p4?.lessonIds);
  expect(at(planCards)?.joinsNext).toBe(false);
  // two periods of one lesson: the same card on both
  if (!p3) throw new Error("no lesson on 19 Nov P3");
  const one = new Map([
    ["13 3|2026-11-19|3", p3],
    ["13 3|2026-11-19|4", { ...p3, slotKey: "13 3|2026-11-19|4" }],
  ]);
  expect(at(one)?.joinsNext).toBe(true);
  // one card and one empty cell
  expect(at(new Map([["13 3|2026-11-19|3", p3]]))?.joinsNext).toBe(false);
});

test("a head placement on a cancelled slot is drawn as cancelled", () => {
  const world = paceWorld();
  const key = "13 1|2026-11-18|2";
  const lesson = card(key);
  expect(lesson?.kind).toBe("teaching");
  // she cancelled the lesson after the plan was accepted: the plan has not moved
  const slots = world.slots.map(
    (s): Slot =>
      s.key === key
        ? {
            ...s,
            status: "cancelled",
            reasons: [{ disruptionId: "d1", text: "Trip", source: "teacher" }],
          }
        : s,
  );
  const cell = cellAt(
    boardFor(FORTNIGHT, days, slots, [SEED_TIMETABLE], () => [], {
      cards: planCards,
    }),
    "2026-11-18",
    2,
  );
  expect(cell?.card?.lessonIds).toEqual(lesson?.lessonIds);
  const out = html(cell);
  expect(out).toContain('data-status="cancelled"');
  expect(out).toContain("Cancelled");
  expect(out).toContain(`${lesson?.title} · ${lesson?.sub}`);
  expect(described(out)).toBe(
    `${lesson?.title}, ${lesson?.sub}, cancelled, not moved until you accept a new plan`,
  );
});

test("the cell's accessible name is unchanged and the lesson is in aria-describedby", () => {
  const view: PlacementView = {
    courseId: "ial-business-u4",
    groupId: "13 1",
    lessonId: "ch3#2",
    slotKey: "13 1|2027-01-08|6",
    date: "2027-01-08",
    period: 6,
    state: "planned",
    pinned: false,
    mergedInto: null,
    viaCover: false,
    itemId: "ch3",
    index: 2,
    of: 4,
    title: "Markets",
    kind: "teaching",
    provenance: ENGINE,
    purpose: null,
  };
  const cell = cellAt(
    boardFor(
      { w1: "2027-01-04", w2: "2027-01-11", breakBefore: true },
      days,
      paceWorld().slots,
      [SEED_TIMETABLE],
      () => [],
      { cards: cardsFor([view], []) },
    ),
    "2027-01-08",
    6,
  );
  const out = html(cell);
  expect(out).toContain(
    'aria-label="13 1, Friday 8 January, period 6, room 206"',
  );
  expect(described(out)).toBe("Markets, 2 of 4, planned");
  expect(out).toContain("Markets · 2 of 4");
});

test("every state has its own words, so colour is never the only difference", () => {
  expect(STATE_LABEL).toEqual({
    planned: "Planned",
    assumed: "Assumed taught",
    taught: "Taught",
    cover: "Cover",
    homework: "Set as homework",
    skipped: "Skipped",
    declared: "Declared",
  });
  expect(new Set(Object.values(STATE_LABEL)).size).toBe(7);
});

test("a spare lesson opens to the explanation of what it is for", () => {
  const { slots } = paceWorld();
  const cell = cellAt(
    boardFor(FORTNIGHT, days, slots, [SEED_TIMETABLE], () => [], {
      cards: planCards,
    }),
    "2026-11-26",
    4,
  );
  const out = html(cell);
  expect(out).toContain(">Spare lesson</button>");
  expect(SPARE_EXPLANATION).toBe(
    "A lesson this group has before the next checkpoint that the other groups do not. Use it for exam practice, support activities or independent study.",
  );
});

test("dates before a group's position show a Declared band naming the topics, not lessons", () => {
  const { slots } = paceWorld();
  const declared = declaredFor([
    {
      courseId: "ial-business-u4",
      groupId: "13 1",
      before: "2026-11-18",
      topics: ["Demand", "Prices"],
    },
  ]);
  const board = boardFor(FORTNIGHT, days, slots, [SEED_TIMETABLE], () => [], {
    declared,
  });
  const before = cellAt(board, "2026-11-16", 5);
  expect(before?.slot?.groupId).toBe("13 1");
  expect(before?.declared).toEqual(["Demand", "Prices"]);
  expect(html(before)).toContain("Declared: Demand, Prices");
  // from the day she gave the position on, nothing is declared
  expect(cellAt(board, "2026-11-18", 2)?.declared).toBeNull();
  // another group is not touched
  expect(cellAt(board, "2026-11-16", 6)?.declared).toBeNull();
});

/** The words drawn in a cell's state line. */
const stateLine = (markup: string) =>
  (/data-state-label="[^"]*">(.*?)<\/span>/.exec(markup)?.[1] ?? "").replace(
    /<!-- -->/g,
    "",
  );

test("each state's words are drawn in the cell, not only told to a reader", () => {
  const { slots } = paceWorld();
  const lesson = card("13 1|2026-11-18|2");
  if (!lesson) throw new Error("no lesson on 18 Nov P2");
  const drawn: Record<string, string> = {};
  for (const state of [
    "planned",
    "assumed",
    "taught",
    "cover",
    "homework",
    "skipped",
  ] as const) {
    const cards = new Map([[lesson.slotKey, { ...lesson, state }]]);
    const cell = cellAt(
      boardFor(FORTNIGHT, days, slots, [SEED_TIMETABLE], () => [], { cards }),
      "2026-11-18",
      2,
    );
    drawn[state] = stateLine(html(cell));
  }
  expect(drawn).toEqual({
    planned: "Planned",
    assumed: "Assumed taught",
    taught: "✓ Taught",
    cover: "↔ Cover",
    homework: "⌂ Set as homework",
    skipped: "✕ Skipped",
  });
});

test("a spare lesson's purpose is on the card's face", () => {
  const view: PlacementView = {
    courseId: "ial-business-u4",
    groupId: "13 3",
    lessonId: "flex:13 3:cp:a1#1",
    slotKey: "13 3|2026-11-26|4",
    date: "2026-11-26",
    period: 4,
    state: "planned",
    pinned: false,
    mergedInto: null,
    viaCover: false,
    itemId: null,
    index: null,
    of: null,
    title: "Spare lesson",
    kind: "flex",
    provenance: ENGINE,
    purpose: "support",
  };
  const cell = cellAt(
    boardFor(FORTNIGHT, days, paceWorld().slots, [SEED_TIMETABLE], () => [], {
      cards: cardsFor([view], []),
    }),
    "2026-11-26",
    4,
  );
  // the hidden description says it too; the face is what is left without it
  const face = html(cell).replace(
    /<span id="[^"]+" hidden="">[^<]*<\/span>/,
    "",
  );
  expect(face).toContain("Support activities");
  expect(face).toContain(">Spare lesson</button>");
});

test("a card carries the number of files attached to its lessons, added up for a merged pair, and none for a spare lesson", () => {
  const world = paceWorld();
  world.merges = [{ id: "m1", groupId: "13 1", first: "c1#2", second: "c1#3" }];
  const cards = cardsOf(world);
  const counts = new Map([
    [clipKey("13 1", "c1#1"), 2],
    [clipKey("13 1", "c1#2"), 1],
    [clipKey("13 1", "c1#3"), 3],
    // the same lesson id in another group is another lesson
    [clipKey("13 3", "c1#1"), 5],
  ]);
  const clipped = withClips(cards, counts);
  const of = (group: string, lesson: string) =>
    [...clipped.values()].find(
      (c) => c.groupId === group && c.lessonIds.includes(lesson),
    );
  expect(of("13 1", "c1#1")?.clips).toBe(2);
  expect(of("13 1", "c1#3")?.clips).toBe(4);
  expect(of("13 3", "c1#1")?.clips).toBe(5);
  expect(of("13 5", "c1#1")?.clips).toBeUndefined();
  expect(clipped.get("13 3|2026-11-26|4")?.clips).toBeUndefined();
  // the paper clip is drawn on the card and told to a reader
  const { slots } = world;
  const board = boardFor(
    { w1: "2026-11-09", w2: "2026-11-16", breakBefore: false },
    days,
    slots,
    [SEED_TIMETABLE],
    () => [],
    { cards: clipped },
  );
  const two = of("13 1", "c1#1");
  const cell = cellAt(
    board,
    two?.slotKey.split("|")[1] ?? "",
    Number(two?.slotKey.split("|")[2]),
  );
  const markup = html(cell);
  expect(markup).toMatch(/data-clips[^>]*>.*2<\/span>/s);
  expect(described(markup)).toMatch(/, 2 files attached$/);
});
