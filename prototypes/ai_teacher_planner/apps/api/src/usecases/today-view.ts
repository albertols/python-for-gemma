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
import { loadPlanning } from "./planning.ts";

export interface TodayView {
  date: IsoDate;
  kind: CalendarDay["kind"] | "no-calendar";
  weekLabel: WeekLabel | null;
  lessons: { slot: Slot; start: string; end: string }[];
  nextTeachingDay: IsoDate | null;
  reminders: Reminder[];
}

const REMINDER_HORIZON_DAYS = 14;

export function todayView(repos: Repos, today: IsoDate): TodayView {
  const { days, slots, groups } = loadPlanning(repos);
  const row = days.find((d) => d.date === today);
  const kind: TodayView["kind"] =
    days.length === 0
      ? "no-calendar"
      : (row?.kind ?? (weekdayOf(today) >= 6 ? "weekend" : "outside-term"));
  const lessons = slots
    .filter((s) => s.date === today)
    .map((slot) => ({ slot, ...PERIOD_TIMES[slot.period] }));
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
      groups,
      horizonDays: REMINDER_HORIZON_DAYS,
    }),
  };
}
