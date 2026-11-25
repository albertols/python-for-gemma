import {
  addDays,
  type CalendarDay,
  type DayKind,
  type Fortnight,
  type GroupId,
  type IsoDate,
  type Period,
  type Slot,
  type SlotKey,
  type TimetableVersion,
  versionOn,
  type Weekday,
  type WeekLabel,
  weekdayOf,
} from "@planner/domain";
import { type CardModel, sameCard } from "./board-plan.ts";

export interface BoardCell {
  period: Period;
  date: IsoDate;
  kind: "lesson" | "duty" | "empty" | "no-school";
  slot: Slot | null;
  /** The group of a lesson, or the label of a duty. */
  label: string | null;
  /**
   * The first half of a double whose two periods are in the same state and
   * hold the same card (or none): it is drawn joined to the next period.
   */
  joinsNext: boolean;
  /** Unconfirmed calendar events that might cancel this lesson. */
  possible: string[];
  /** The other period of a double, even when the two are drawn apart because one is cancelled. */
  doublePartner: Period | null;
  /** What the plan puts in this lesson; null when no plan does. */
  card: CardModel | null;
  /** Before the group's position: the topics declared as taught then. Null otherwise. */
  declared: string[] | null;
}
export interface BoardDay {
  date: IsoDate;
  dayKind: DayKind;
  /** Why a day is not a pupil day, or what the calendar says about it. */
  text: string | null;
  /** She changed this day's week label. */
  corrected: boolean;
  /** The last pupil day before a break of a week or more. */
  lastBeforeBreak: boolean;
  cells: BoardCell[];
}
export interface BoardWeek {
  monday: IsoDate | null;
  /** The distinct labels of the pupil days, in date order. */
  labels: WeekLabel[];
  days: BoardDay[];
  /** Its pupil days carry different labels (Monday Week 2, Wednesday Week 1). A holiday with another label does not count. */
  mixed: boolean;
}

const stateOf = (s: Slot) =>
  `${s.status}|${s.reasons.map((r) => r.text).join(";")}`;
const sameState = (a: Slot, b: Slot, possibleOf: PossibleOf) =>
  stateOf(a) === stateOf(b) &&
  possibleOf(a).join(";") === possibleOf(b).join(";");

/** The unconfirmed events that might cancel a lesson. */
export type PossibleOf = (slot: Slot) => string[];

const PERIODS: Period[] = [1, 2, 3, 4, 5, 6];

/** What the board shows: some groups only, and which days end before a break. */
export interface BoardOptions {
  /** Only these groups' lessons are drawn; null or absent means all. */
  groups?: ReadonlySet<string> | null;
  lastDays?: ReadonlySet<IsoDate> | undefined;
  /** The plans' cards by slot (`cardsFor`). */
  cards?: ReadonlyMap<SlotKey, CardModel> | undefined;
  /** Each group's declared topics and the day her position was given (`declaredFor`). */
  declared?:
    | ReadonlyMap<GroupId, { before: IsoDate; topics: string[] }>
    | undefined;
}

function dayOf(
  date: IsoDate,
  weekday: Weekday,
  day: CalendarDay | undefined,
  slotsOnDate: readonly Slot[],
  timetables: readonly TimetableVersion[],
  possibleOf: PossibleOf,
  options: BoardOptions,
): BoardDay {
  const lastBeforeBreak = options.lastDays?.has(date) ?? false;
  const dayKind: DayKind = day?.kind ?? "outside-term";
  const text = day?.text ?? null;
  const corrected = day?.labelSource === "teacher";
  if (!day?.pupilDay || day.weekLabel === null)
    return {
      date,
      dayKind,
      text,
      corrected,
      lastBeforeBreak,
      cells: PERIODS.map((period) => ({
        period,
        date,
        kind: "no-school",
        slot: null,
        label: null,
        joinsNext: false,
        doublePartner: null,
        possible: [],
        card: null,
        declared: null,
      })),
    };
  const duties = versionOn(timetables, date)?.duties ?? [];
  return {
    date,
    dayKind,
    text,
    corrected,
    lastBeforeBreak,
    cells: PERIODS.map((period): BoardCell => {
      const found = slotsOnDate.find((s) => s.period === period);
      // A lesson of a group she filtered out leaves its cell empty, so the grid keeps its shape.
      const hidden =
        found !== undefined &&
        options.groups != null &&
        !options.groups.has(found.groupId);
      const slot = hidden ? undefined : found;
      if (slot) {
        const doublePartner = slot.doubleWith
          ? ((period % 2 === 1 ? period + 1 : period - 1) as Period)
          : null;
        const partner = slotsOnDate.find((s) => s.key === slot.doubleWith);
        const cardOf = (key: SlotKey) => options.cards?.get(key) ?? null;
        const card = cardOf(slot.key);
        const band = options.declared?.get(slot.groupId);
        return {
          period,
          date,
          kind: "lesson",
          slot,
          label: slot.groupId,
          // A double with one period cancelled is drawn as two cells, so the one that still runs does not look lost.
          // Two different lessons in a double are two cards, so they are drawn apart too.
          joinsNext:
            partner !== undefined &&
            period % 2 === 1 &&
            sameState(slot, partner, possibleOf) &&
            sameCard(card, cardOf(partner.key)),
          doublePartner,
          possible: possibleOf(slot),
          card,
          declared:
            card === null && band && date < band.before ? band.topics : null,
        };
      }
      const duty = duties.find(
        (d) =>
          d.week === day.weekLabel &&
          d.weekday === weekday &&
          d.period === period,
      );
      return {
        period,
        date,
        kind: found ? "empty" : duty ? "duty" : "empty",
        slot: null,
        label: found ? null : (duty?.label ?? null),
        joinsNext: false,
        doublePartner: null,
        possible: [],
        card: null,
        declared: null,
      };
    }),
  };
}

function weekOf(
  monday: IsoDate | null,
  days: readonly CalendarDay[],
  slots: readonly Slot[],
  timetables: readonly TimetableVersion[],
  possibleOf: PossibleOf,
  options: BoardOptions,
): BoardWeek | null {
  if (monday === null) return null;
  const boardDays = ([1, 2, 3, 4, 5] as const).map((weekday) => {
    const date = addDays(monday, weekday - 1);
    return dayOf(
      date,
      weekday,
      days.find((d) => d.date === date),
      slots.filter((s) => s.date === date),
      timetables,
      possibleOf,
      options,
    );
  });
  const labels: WeekLabel[] = [];
  for (const b of boardDays) {
    const day = days.find((d) => d.date === b.date);
    if (!day?.pupilDay || day.weekLabel === null) continue;
    if (!labels.includes(day.weekLabel)) labels.push(day.weekLabel);
  }
  return {
    monday,
    labels,
    days: boardDays,
    mixed: labels.length > 1,
  };
}

/**
 * Both weeks of a fortnight laid out like her timetable. Lessons come from
 * the slots; duties come from the timetable version in force on each date.
 */
export function boardFor(
  fortnight: Fortnight,
  days: readonly CalendarDay[],
  slots: readonly Slot[],
  timetables: readonly TimetableVersion[],
  possibleOf: PossibleOf = () => [],
  options: BoardOptions = {},
): { w1: BoardWeek | null; w2: BoardWeek | null } {
  return {
    w1: weekOf(fortnight.w1, days, slots, timetables, possibleOf, options),
    w2: weekOf(fortnight.w2, days, slots, timetables, possibleOf, options),
  };
}

/** One week laid out like a fortnight's weeks. */
export function weekFor(
  monday: IsoDate,
  days: readonly CalendarDay[],
  slots: readonly Slot[],
  timetables: readonly TimetableVersion[],
  possibleOf: PossibleOf = () => [],
  options: BoardOptions = {},
): BoardWeek | null {
  return weekOf(monday, days, slots, timetables, possibleOf, options);
}

/** The Mondays of every week that has pupil days, in date order. */
export function weeksOf(fortnights: readonly Fortnight[]): IsoDate[] {
  return fortnights
    .flatMap((f) => [f.w1, f.w2])
    .filter((m): m is IsoDate => m !== null)
    .sort();
}

/** The week holding the date (Monday to Sunday), else the next one after it, else null. */
export function weekContaining(
  mondays: readonly IsoDate[],
  date: IsoDate,
): IsoDate | null {
  return (
    mondays.find((m) => m <= date && date <= addDays(m, 6)) ??
    mondays.find((m) => m > date) ??
    null
  );
}

/** Today's week; on a weekend, the coming one. */
export function weekToShow(
  mondays: readonly IsoDate[],
  today: IsoDate,
): IsoDate | null {
  const day = weekdayOf(today);
  return weekContaining(mondays, day >= 6 ? addDays(today, 8 - day) : today);
}

/** The fortnight holding the date, else the next one after it, else null. */
export function fortnightContaining(
  fortnights: readonly Fortnight[],
  date: IsoDate,
): Fortnight | null {
  const startOf = (f: Fortnight) => f.w1 ?? f.w2 ?? "";
  const endOf = (f: Fortnight) => addDays(f.w2 ?? f.w1 ?? "", 6);
  return (
    fortnights.find((f) => startOf(f) <= date && date <= endOf(f)) ??
    fortnights.find((f) => startOf(f) > date) ??
    null
  );
}
