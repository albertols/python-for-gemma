import {
  type CalendarDay,
  type IsoDate,
  PERIOD_TIMES,
  type Reminder,
  reminders,
  type Slot,
  type WeekLabel,
  weekdayOf,
} from "@planner/domain";
import type { Repos } from "../repos/ports.ts";
import { type PlacementView, placementsIn } from "./placements.ts";
import { loadPlanning } from "./planning.ts";

export interface TodayView {
  date: IsoDate;
  kind: CalendarDay["kind"] | "no-calendar";
  weekLabel: WeekLabel | null;
  lessons: {
    slot: Slot;
    start: string;
    end: string;
    lesson: TodayLesson | null;
  }[];
  nextTeachingDay: IsoDate | null;
  reminders: Reminder[];
}

/** The lesson a plan puts in one of today's slots. */
export interface TodayLesson {
  lessonId: string;
  title: string;
  kind: PlacementView["kind"];
}

const REMINDER_HORIZON_DAYS = 14;

/**
 * The lesson in one slot, from the board's own placements so the two agree. A
 * merged pair is one lesson named by its first, with both titles.
 */
function lessonIn(
  views: readonly PlacementView[],
  slotKey: string,
): TodayLesson | null {
  const here = views.filter((v) => v.slotKey === slotKey);
  const first = here.find((v) => v.mergedInto === null) ?? here[0];
  if (!first) return null;
  const titles = [...new Set(here.map((v) => v.title))];
  return {
    lessonId: first.lessonId,
    title: titles.join(" and "),
    kind: first.kind,
  };
}

export function todayView(repos: Repos, today: IsoDate): TodayView {
  const { days, slots, groups } = loadPlanning(repos);
  const row = days.find((d) => d.date === today);
  const kind: TodayView["kind"] =
    days.length === 0
      ? "no-calendar"
      : (row?.kind ?? (weekdayOf(today) >= 6 ? "weekend" : "outside-term"));
  const { placements } = placementsIn(repos, today, today, today);
  const lessons = slots
    .filter((s) => s.date === today)
    .map((slot) => ({
      slot,
      ...PERIOD_TIMES[slot.period],
      lesson: lessonIn(placements, slot.key),
    }));
  const next = slots.find((s) => s.date > today && s.status === "open");
  return {
    date: today,
    kind,
    weekLabel: row?.weekLabel ?? null,
    lessons,
    nextTeachingDay: next?.date ?? null,
    reminders: reminders({
      today,
      windows: repos.calendar.windows(),
      evenings: repos.calendar.evenings(),
      exams: repos.exams.list(),
      groups,
      horizonDays: REMINDER_HORIZON_DAYS,
    }),
  };
}
