import {
  buildSlots,
  type CalendarDay,
  type Group,
  type Slot,
  type Term,
  type TimetableVersion,
  toCalendarDays,
} from "@planner/domain";
import type { Repos } from "../repos/ports.ts";

export interface Planning {
  terms: Term[];
  days: CalendarDay[];
  timetables: TimetableVersion[];
  groups: Group[];
  /** Every slot of the year, in slot order. */
  slots: Slot[];
}

/** The stored inputs, including the lessons she cancelled, and what the engine derives from them. */
export function loadPlanning(repos: Repos): Planning {
  const terms = repos.settings.terms();
  const days = toCalendarDays(repos.calendar.rows(), terms);
  const timetables = repos.timetable.versions();
  const groups = repos.timetable.groups();
  return {
    terms,
    days,
    timetables,
    groups,
    slots: buildSlots({
      days,
      timetables,
      groups,
      disruptions: repos.disruptions.list(),
    }),
  };
}
