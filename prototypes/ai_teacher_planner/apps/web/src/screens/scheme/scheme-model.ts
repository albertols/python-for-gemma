import {
  type CurriculumPack,
  fitFor,
  type GroupOverride,
  type ItemKind,
  type PlanInputs,
  type SowItem,
  schemeTotals,
  TEACHER,
} from "@planner/domain";

/**
 * Her scheme as she is editing it. Everything here returns a new list: the saved
 * scheme is never changed until she saves, and the totals are worked out from the
 * edited list with the engine's own `fitFor`, so they match what the plan will do.
 */

/** The engine's inputs with her unsaved items and group counts in place of the stored ones. */
export function withEdits(
  inputs: PlanInputs,
  items: readonly SowItem[],
  overrides: readonly GroupOverride[],
): PlanInputs {
  return { ...inputs, items: [...items], overrides: [...overrides] };
}

/** Lessons per fortnight for each group, counted from a timetable version. */
export function lessonsPerFortnight(timetable: {
  entries: readonly { groupId: string }[];
}): Record<string, number> {
  const per: Record<string, number> = {};
  for (const e of timetable.entries) per[e.groupId] = (per[e.groupId] ?? 0) + 1;
  return per;
}

export interface GroupTotals {
  groupId: string;
  teaching: number;
  project: number;
  revision: number;
  buffer: number;
  /** Assessments that take a whole lesson. */
  assessments: number;
  lessonsPerFortnight: number;
  /** Lessons of the scheme still to teach, and the slots that can take them. */
  lessonsLeft: number;
  slotsLeft: number;
  over: number;
  fits: boolean;
}

/** One line of totals for each group of the course. */
export function totalsPerGroup(
  inputs: PlanInputs,
  perFortnight: Readonly<Record<string, number>>,
): GroupTotals[] {
  return fitFor(inputs).map((fit) => {
    const t = schemeTotals(inputs.items, inputs.overrides, fit.groupId);
    return {
      groupId: fit.groupId,
      teaching: t.teaching,
      project: t.project,
      revision: t.revision,
      buffer: t.buffer,
      assessments: t.assessmentSlots,
      lessonsPerFortnight: perFortnight[fit.groupId] ?? 0,
      lessonsLeft: fit.lessonsLeft,
      slotsLeft: fit.slotsLeft,
      over: fit.over,
      fits: fit.fits,
    };
  });
}

/** Changes some fields of one item. If something really changes, the item is hers from now on. */
export function editItem(
  items: readonly SowItem[],
  id: string,
  patch: Partial<
    Pick<SowItem, "title" | "lessons" | "packRefs" | "note" | "assessment">
  >,
): SowItem[] {
  return items.map((item) => {
    if (item.id !== id) return item;
    const next = { ...item, ...patch };
    return JSON.stringify(next) === JSON.stringify(item)
      ? item
      : { ...next, provenance: TEACHER };
  });
}

const renumbered = (items: readonly SowItem[]): SowItem[] =>
  items.map((item, n) =>
    item.order === n + 1 ? item : { ...item, order: n + 1 },
  );

/** Moves an item by `steps` places (negative is up), stopping at the ends, and renumbers the order. */
export function moveItem(
  items: readonly SowItem[],
  id: string,
  steps: number,
): SowItem[] {
  const from = items.findIndex((i) => i.id === id);
  if (from === -1) return [...items];
  const to = Math.min(items.length - 1, Math.max(0, from + steps));
  if (to === from) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved) next.splice(to, 0, moved);
  return renumbered(next);
}

const NEW_TITLE: Record<ItemKind, string> = {
  teaching: "New chapter",
  project: "New project",
  revision: "Revision",
  buffer: "Buffer",
  assessment: "New assessment",
};

/** A new item of any kind at the end of the scheme. Its id is the kind and a number nothing uses yet. */
export function addItem(
  items: readonly SowItem[],
  courseId: string,
  kind: ItemKind,
): SowItem[] {
  const used = new Set(items.map((i) => i.id));
  let n = 1;
  while (used.has(`${kind}-${n}`)) n++;
  const item: SowItem = {
    id: `${kind}-${n}`,
    courseId,
    order: items.length + 1,
    kind,
    title: NEW_TITLE[kind],
    lessons: kind === "assessment" ? 0 : 1,
    track: "core",
    packRefs: [],
    prerequisites: [],
    availableFrom: null,
    note: null,
    assessment:
      kind === "assessment"
        ? {
            date: null,
            type: "Assessment",
            marks: null,
            durationMinutes: null,
            slotUse: "whole",
            status: "planned",
            covers: [],
          }
        : null,
    provenance: TEACHER,
  };
  return renumbered([...items, item]);
}

/** The titles of the items that need this one: they name it as a prerequisite or an assessment covers it. */
export function dependentsOf(items: readonly SowItem[], id: string): string[] {
  return items
    .filter(
      (i) =>
        i.id !== id &&
        (i.prerequisites.includes(id) ||
          (i.assessment?.covers ?? []).includes(id)),
    )
    .map((i) => i.title);
}

export type Removal =
  | { ok: true; items: SowItem[]; overrides: GroupOverride[] }
  | { ok: false; blockedBy: string[] };

/** Deletes an item and the group counts that named it, unless another item depends on it. */
export function removeItem(
  items: readonly SowItem[],
  overrides: readonly GroupOverride[],
  id: string,
): Removal {
  const blockedBy = dependentsOf(items, id);
  if (blockedBy.length > 0) return { ok: false, blockedBy };
  return {
    ok: true,
    items: renumbered(items.filter((i) => i.id !== id)),
    overrides: overrides.filter((o) => o.itemId !== id),
  };
}

/** Sets one group's own count for an item, or with `null` puts the group back on the item's count. */
export function setOverride(
  overrides: readonly GroupOverride[],
  groupId: string,
  itemId: string,
  lessons: number | null,
): GroupOverride[] {
  const others = overrides.filter(
    (o) => !(o.groupId === groupId && o.itemId === itemId),
  );
  return lessons === null ? others : [...others, { groupId, itemId, lessons }];
}

/** The chapters an item is linked to, and the spec point codes those chapters cover. */
export function specRefsOf(
  item: SowItem,
  pack: CurriculumPack,
): { chapters: string[]; codes: string[] } {
  const chapters = pack.chapters.filter((c) => item.packRefs.includes(c.id));
  const points = new Set(chapters.flatMap((c) => c.specPointIds));
  return {
    chapters: chapters.map((c) => `Chapter ${c.number}: ${c.title}`),
    codes: pack.specPoints.filter((p) => points.has(p.id)).map((p) => p.code),
  };
}

/** A teaching item with no chapter of the pack. A project is not expected to have one. */
export function isUnlinked(item: SowItem): boolean {
  return item.kind === "teaching" && item.packRefs.length === 0;
}

export interface CountSuggestion {
  from: number | null;
  to: number;
  reason: string | null;
  tricky: boolean;
}

/** A lesson-count AI item as a difference from her number; null for any other item or malformed data. */
export function suggestionOf(item: {
  kind: string;
  data: unknown;
}): CountSuggestion | null {
  const d = item.data;
  if (item.kind !== "lesson-count" || typeof d !== "object" || d === null)
    return null;
  const { from, to, reason, tricky } = d as Record<string, unknown>;
  if (typeof to !== "number" || !Number.isInteger(to)) return null;
  return {
    from: typeof from === "number" ? from : null,
    to,
    reason: typeof reason === "string" ? reason : null,
    tricky: tricky === true,
  };
}

/** "4 → 5", or just the new number when her old one is not known. */
export function differenceText(from: number | null, to: number): string {
  return from === null ? String(to) : `${from} → ${to}`;
}
