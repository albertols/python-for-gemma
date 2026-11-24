import type { CalendarDay, CalendarRow, YearGroup } from "./calendar.ts";
import type { IsoDate } from "./dates.ts";
import type { Origin } from "./provenance.ts";
import {
  type Disruption,
  type DisruptionScope,
  disruptionHitsSlot,
  type Slot,
} from "./slots.ts";
import type { Group, GroupId, Period } from "./timetable.ts";

export type EventCategory =
  | "staff-only"
  | "mock-exams"
  | "external-exam"
  | "study-leave"
  | "coursework"
  | "half-day"
  | "trip"
  | "assembly"
  | "meeting"
  | "other";
export type EventSuggestion = "cancels" | "no-effect" | "unsure";

export interface EventCandidate {
  wordingKey: string;
  /** The wording as first seen, with runs of spaces collapsed. It becomes the reason on a cancelled lesson. */
  text: string;
  column: "secondary" | "events" | "assessments";
  yearGroup: YearGroup | null;
  dates: IsoDate[];
  presort: {
    category: EventCategory;
    suggestion: EventSuggestion;
    rule: string | null;
  };
}

/** Her confirmation. A suggestion is never one: only this cancels lessons. */
export interface EventClassification {
  id: string;
  wordingKey: string;
  yearGroup: YearGroup | null;
  /** null: every date of the candidate. */
  onlyDates: IsoDate[] | null;
  decision: "cancels" | "no-effect";
  groupIds: GroupId[] | null;
  periods: Period[] | null;
  /** Each kept date cancels from that date through this one. */
  until: IsoDate | null;
  provenance: Origin;
}

export function wordingKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

type Rule = {
  category: EventCategory;
  suggestion: EventSuggestion;
  needles: (string | RegExp)[];
};
/** First match wins, case-insensitive. */
const PRESORT: Rule[] = [
  {
    category: "staff-only",
    suggestion: "cancels",
    needles: ["staff only", "staff training", "inset", "closed to pupils"],
  },
  { category: "study-leave", suggestion: "cancels", needles: ["study leave"] },
  { category: "mock-exams", suggestion: "cancels", needles: ["mock"] },
  { category: "half-day", suggestion: "unsure", needles: ["half day"] },
  {
    category: "coursework",
    suggestion: "cancels",
    needles: ["extended essay", /\bee\b/],
  },
  {
    category: "external-exam",
    suggestion: "cancels",
    needles: ["official exam", "external exam"],
  },
  {
    category: "trip",
    suggestion: "unsure",
    needles: ["trip", "visit", "excursion", "conference"],
  },
  {
    category: "assembly",
    suggestion: "unsure",
    needles: ["assembly", "photo", "talk", "workshop"],
  },
  {
    category: "meeting",
    suggestion: "no-effect",
    needles: ["parent", "meeting", "deadline", "report"],
  },
];

export function presortOf(text: string): EventCandidate["presort"] {
  const key = wordingKey(text);
  for (const rule of PRESORT) {
    const hit = rule.needles.find((n) =>
      typeof n === "string" ? key.includes(n) : n.test(key),
    );
    if (hit !== undefined)
      return {
        category: rule.category,
        suggestion: rule.suggestion,
        rule: typeof hit === "string" ? hit : "ee",
      };
  }
  return { category: "other", suggestion: "unsure", rule: null };
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const identity = (yearGroup: YearGroup | null, key: string) =>
  `${yearGroup ?? "school"}|${key}`;

const ASSESSMENTS_OF_PROGRAMME = {
  IGCSE: "assessments",
  IB: "assessmentsIb",
  "A level": "assessmentsALevel",
} as const;

const linesOf = (cell: string | null | undefined): string[] =>
  (cell ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l !== "");

/**
 * Wordings from the school column (whole school) and from the events and
 * assessments cells of the years she teaches. A date is kept only when she has
 * a slot that day (in that year, or in any year for the school column). A
 * slot counts whether open or cancelled, so one confirmation never hides
 * another's dates.
 */
export function eventCandidates(args: {
  rows: readonly CalendarRow[];
  days: readonly CalendarDay[];
  groups: readonly Group[];
  slots: readonly Slot[];
}): EventCandidate[] {
  const yearOf = new Map(args.groups.map((g) => [g.id, g.yearGroup]));
  const pupilDays = new Set(
    args.days.filter((d) => d.pupilDay).map((d) => d.date),
  );
  const anyDates = new Set<IsoDate>();
  const yearDates = new Map<YearGroup, Set<IsoDate>>();
  for (const s of args.slots) {
    if (!pupilDays.has(s.date)) continue;
    anyDates.add(s.date);
    const y = yearOf.get(s.groupId);
    if (y === undefined) continue;
    const set = yearDates.get(y) ?? new Set<IsoDate>();
    set.add(s.date);
    yearDates.set(y, set);
  }
  const programmes = new Map<string, { year: YearGroup; col: string }>();
  for (const g of args.groups)
    programmes.set(`${g.yearGroup}|${g.programme}`, {
      year: g.yearGroup,
      col: ASSESSMENTS_OF_PROGRAMME[g.programme],
    });

  const found = new Map<string, EventCandidate>();
  const add = (
    text: string,
    column: EventCandidate["column"],
    yearGroup: YearGroup | null,
    date: IsoDate,
  ) => {
    const key = wordingKey(text);
    const id = identity(yearGroup, key);
    const existing = found.get(id);
    if (existing) {
      if (!existing.dates.includes(date)) existing.dates.push(date);
      return;
    }
    found.set(id, {
      wordingKey: key,
      text,
      column,
      yearGroup,
      dates: [date],
      presort: presortOf(text),
    });
  };

  for (const row of [...args.rows].sort((a, b) => compare(a.date, b.date))) {
    if (anyDates.has(row.date))
      for (const line of linesOf(row.secondaryEvent))
        add(line, "secondary", null, row.date);
    for (const { year, col } of programmes.values()) {
      if (!yearDates.get(year)?.has(row.date)) continue;
      const cells = row.byYear[year];
      if (!cells) continue;
      for (const line of linesOf(cells.events))
        add(line, "events", year, row.date);
      const assessments = cells[col as "assessments"];
      for (const line of linesOf(assessments))
        add(line, "assessments", year, row.date);
    }
  }
  return [...found.values()].sort(
    (a, b) =>
      compare(a.dates[0] ?? "", b.dates[0] ?? "") ||
      (a.yearGroup ?? 0) - (b.yearGroup ?? 0) ||
      compare(a.wordingKey, b.wordingKey),
  );
}

const matches = (c: EventCandidate, k: EventClassification) =>
  c.wordingKey === k.wordingKey && c.yearGroup === k.yearGroup;

/** The dates of a candidate that a confirmation covers. */
export function keptDates(
  candidate: EventCandidate,
  k: EventClassification,
): IsoDate[] {
  return k.onlyDates === null
    ? candidate.dates
    : candidate.dates.filter((d) => k.onlyDates?.includes(d));
}

function scopesOf(
  k: EventClassification,
  groups: readonly Group[],
): { scope: DisruptionScope; key: string }[] {
  if (k.groupIds !== null) {
    const known = new Set(groups.map((g) => g.id));
    return [...new Set(k.groupIds)]
      .filter((g) => known.has(g))
      .sort(compare)
      .map((groupId) => ({
        scope: { kind: "group", groupId },
        key: `g${groupId}`,
      }));
  }
  if (k.yearGroup !== null)
    return [
      {
        scope: { kind: "year", yearGroup: k.yearGroup },
        key: `y${k.yearGroup}`,
      },
    ];
  return [{ scope: { kind: "school" }, key: "school" }];
}

/** Only a confirmation that cancels makes disruptions: one per kept date and scope, computed here and never stored. */
export function disruptionsFromEvents(
  candidates: readonly EventCandidate[],
  classifications: readonly EventClassification[],
  groups: readonly Group[],
): Disruption[] {
  const out: Disruption[] = [];
  for (const k of [...classifications].sort((a, b) => compare(a.id, b.id))) {
    if (k.decision !== "cancels") continue;
    const candidate = candidates.find((c) => matches(c, k));
    if (!candidate) continue;
    for (const date of keptDates(candidate, k))
      for (const { scope, key } of scopesOf(k, groups))
        out.push({
          id: `ev:${k.id}:${date}:${key}`,
          scope,
          from: date,
          to: k.until ?? date,
          periods: k.periods,
          effect: "cancelled",
          reason: candidate.text,
          source: "calendar",
        });
  }
  return out;
}

/** Each date of a candidate that she has not confirmed (either way). */
export function possibleDisruptions(
  candidates: readonly EventCandidate[],
  classifications: readonly EventClassification[],
): { date: IsoDate; yearGroup: YearGroup | null; text: string }[] {
  return candidates
    .flatMap((c) => {
      const kept = new Set(
        classifications
          .filter((k) => matches(c, k))
          .flatMap((k) => keptDates(c, k)),
      );
      return c.dates
        .filter((d) => !kept.has(d))
        .map((date) => ({ date, yearGroup: c.yearGroup, text: c.text }));
    })
    .sort(
      (a, b) =>
        compare(a.date, b.date) ||
        (a.yearGroup ?? 0) - (b.yearGroup ?? 0) ||
        compare(a.text, b.text),
    );
}

/** Pairs of confirmations of one wording whose kept dates overlap; one entry per pair, naming the first shared date. */
export function classificationConflicts(
  candidates: readonly EventCandidate[],
  classifications: readonly EventClassification[],
): { a: string; b: string; date: IsoDate }[] {
  const out: { a: string; b: string; date: IsoDate }[] = [];
  const sorted = [...classifications].sort((x, y) => compare(x.id, y.id));
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (!a || !b) continue;
      if (a.wordingKey !== b.wordingKey || a.yearGroup !== b.yearGroup)
        continue;
      const c = candidates.find((x) => matches(x, a));
      const datesOf = (k: EventClassification) =>
        c ? keptDates(c, k) : (k.onlyDates ?? []);
      const mine = new Set(datesOf(a));
      const shared = datesOf(b)
        .filter((d) => mine.has(d))
        .sort(compare)[0];
      if (shared !== undefined) out.push({ a: a.id, b: b.id, date: shared });
    }
  return out;
}

export interface StaleClassification {
  classification: EventClassification;
  /** The calendar has no such wording any more (it was changed or removed). */
  candidateGone: boolean;
  /** Dates she confirmed that the calendar no longer has for it. */
  missingDates: IsoDate[];
}

/**
 * Confirmations that no longer fit the calendar: the wording is gone (it
 * cancels nothing) or some confirmed dates are gone (those dates cancel
 * nothing; the rest still do). They are reported until she removes them.
 */
export function staleClassifications(
  candidates: readonly EventCandidate[],
  classifications: readonly EventClassification[],
): StaleClassification[] {
  return classifications.flatMap((k): StaleClassification[] => {
    const c = candidates.find((x) => matches(x, k));
    if (!c)
      return [{ classification: k, candidateGone: true, missingDates: [] }];
    const missing = (k.onlyDates ?? []).filter((d) => !c.dates.includes(d));
    return missing.length === 0
      ? []
      : [
          {
            classification: k,
            candidateGone: false,
            missingDates: [...missing].sort(compare),
          },
        ];
  });
}

/** The slots these disruptions take, by the engine's own rule. */
export function lessonsHitBy(
  disruptions: readonly Disruption[],
  slots: readonly Slot[],
  groups: readonly Group[],
): Slot[] {
  const yearOf = new Map(groups.map((g) => [g.id, g.yearGroup]));
  return slots.filter((s) =>
    disruptions.some((d) => disruptionHitsSlot(d, s, yearOf)),
  );
}

/** What a lesson says is possible: the unconfirmed events of its date, for its year or the whole school. Not an event that already cancelled it. */
export function possibleTextsFor(
  slot: Pick<Slot, "date" | "groupId" | "reasons">,
  yearOf: ReadonlyMap<GroupId, YearGroup>,
  possible: readonly {
    date: IsoDate;
    yearGroup: YearGroup | null;
    text: string;
  }[],
): string[] {
  const year = yearOf.get(slot.groupId);
  const texts = possible
    .filter(
      (p) =>
        p.date === slot.date && (p.yearGroup === null || p.yearGroup === year),
    )
    .map((p) => p.text)
    .filter((t) => !slot.reasons.some((r) => r.text === t));
  return [...new Set(texts)];
}
