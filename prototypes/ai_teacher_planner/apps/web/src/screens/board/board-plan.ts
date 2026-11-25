import type {
  GroupId,
  IsoDate,
  Lesson,
  LessonId,
  PlacementState,
  Provenance,
  SlotKey,
  SlotStatus,
} from "@planner/domain";
import type {
  AssessmentView,
  DeclaredView,
  PlacementView,
} from "../../api/queries.ts";
import { PURPOSE_LABEL, STATE_LABEL } from "../../lib/plan-words.ts";

/** One card on the board: the lesson (or merged pair) in a slot, or an assessment that fills it. */
export interface CardModel {
  /** Which card this is: its lessons, or the assessment filling the slot. Two slots holding the same card are one lesson. */
  id: string;
  slotKey: SlotKey;
  groupId: GroupId;
  lessonIds: LessonId[];
  /** "Markets", "Spare lesson" (or her own title for it), or the assessment's title. */
  title: string;
  /** "2 of 4"; for a spare lesson she renamed, "Spare lesson" and its purpose. */
  sub: string;
  state: PlacementState;
  kind: Lesson["kind"] | "assessment";
  pinned: boolean;
  /** An in-lesson assessment is a chip on the lesson; a whole-slot one is its own card. */
  assessment: { title: string; slotUse: "whole" | "in-lesson" } | null;
  provenance: Provenance;
}

/** "2 of 4", "2 and 3 of 3", or "4 of 4 and 1 of 3" when the pair spans two items. */
function subOf(lessons: readonly PlacementView[]): string {
  const part = (v: PlacementView) =>
    v.of === null ? `lesson ${v.index}` : `${v.index} of ${v.of}`;
  const [first, second] = lessons;
  if (!first) return "";
  if (!second) return part(first);
  if (first.itemId === second.itemId && first.of !== null)
    return `${first.index} and ${second.index} of ${first.of}`;
  return `${part(first)} and ${part(second)}`;
}

function lessonCard(slotKey: SlotKey, here: PlacementView[]): CardModel {
  // the lesson a pair is merged into comes first
  const ordered = [...here].sort(
    (a, b) =>
      Number(a.mergedInto !== null) - Number(b.mergedInto !== null) ||
      (a.index ?? 0) - (b.index ?? 0),
  );
  const first = ordered[0] as PlacementView;
  const spare = first.kind === "flex";
  const purpose = first.purpose ? PURPOSE_LABEL[first.purpose] : null;
  const titles = [...new Set(ordered.map((v) => v.title))];
  return {
    id: `${first.groupId}:${ordered.map((v) => v.lessonId).join("+")}`,
    slotKey,
    groupId: first.groupId,
    lessonIds: ordered.map((v) => v.lessonId),
    title: titles.join(" and "),
    sub: spare
      ? [first.title === "Spare lesson" ? null : "Spare lesson", purpose]
          .filter(Boolean)
          .join(" · ")
      : subOf(ordered),
    state: first.state,
    kind: first.kind === "assessment" ? "teaching" : first.kind,
    pinned: ordered.some((v) => v.pinned),
    assessment: null,
    provenance: first.provenance,
  };
}

/**
 * The board's cards by slot, from GET /api/placements. A merged pair is one
 * card; an in-lesson assessment is a chip on the card of its lesson; a
 * whole-slot assessment is a card of its own.
 */
export function cardsFor(
  placements: readonly PlacementView[],
  assessments: readonly AssessmentView[],
): Map<SlotKey, CardModel> {
  const bySlot = new Map<SlotKey, PlacementView[]>();
  for (const p of placements) {
    if (p.slotKey === null) continue;
    const list = bySlot.get(p.slotKey) ?? [];
    list.push(p);
    bySlot.set(p.slotKey, list);
  }
  const cards = new Map<SlotKey, CardModel>();
  for (const [slotKey, here] of bySlot)
    cards.set(slotKey, lessonCard(slotKey, here));
  for (const a of assessments) {
    const chip = { title: a.title, slotUse: a.slotUse };
    const lesson = cards.get(a.slotKey);
    if (lesson && a.slotUse === "in-lesson") {
      cards.set(a.slotKey, { ...lesson, assessment: chip });
      continue;
    }
    cards.set(a.slotKey, {
      id: `${a.groupId}:assessment:${a.itemId}`,
      slotKey: a.slotKey,
      groupId: a.groupId,
      lessonIds: [],
      title: a.title,
      sub: a.slotUse === "whole" ? "Assessment, whole lesson" : "Assessment",
      state: "planned",
      kind: "assessment",
      pinned: false,
      assessment: chip,
      provenance: a.provenance,
    });
  }
  return cards;
}

/** Two periods hold the same card: one lesson across both, or nothing in either. */
export function sameCard(a: CardModel | null, b: CardModel | null): boolean {
  if (a === null || b === null) return a === b;
  return a.id === b.id;
}

/** Each group's declared topics and the day the band ends, for BoardOptions. */
export function declaredFor(
  bands: readonly DeclaredView[],
): Map<GroupId, { before: IsoDate; topics: string[] }> {
  return new Map(
    bands.map((b) => [b.groupId, { before: b.before, topics: b.topics }]),
  );
}

/**
 * The lesson a cell holds, in words, for its aria-describedby: "Markets, 2 of
 * 4, planned". A lesson whose slot was cancelled after the plan was accepted
 * says it has not moved yet.
 */
export function describeCard(card: CardModel, status: SlotStatus): string {
  const what = [card.title, card.sub].filter(Boolean).join(", ");
  if (status === "cancelled")
    return `${what}, cancelled, not moved until you accept a new plan`;
  const parts = [what];
  if (card.kind !== "assessment")
    parts.push(STATE_LABEL[card.state].toLowerCase());
  if (card.assessment && card.kind !== "assessment")
    parts.push(`with ${card.assessment.title} in the lesson`);
  if (card.pinned) parts.push("pinned");
  return parts.join(", ");
}
