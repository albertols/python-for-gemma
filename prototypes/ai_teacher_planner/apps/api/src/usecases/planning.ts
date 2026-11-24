import {
  buildSlots,
  type CalendarDay,
  type Disruption,
  disruptionsFromEvents,
  type EventCandidate,
  type EventClassification,
  eventCandidates,
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
  /** The slots with no cancellation applied: every lesson she has, open or cancelled. */
  allSlots: Slot[];
  /** Everything that cancels lessons: hers, and the events she confirmed. */
  disruptions: Disruption[];
  /** Calendar events she could confirm, and her confirmations. */
  candidates: EventCandidate[];
  classifications: EventClassification[];
}

/**
 * The stored inputs, including her label corrections, the lessons she cancelled
 * and the calendar events she confirmed, and what the engine derives from them.
 * An event cancels lessons only through a confirmation, worked out here each time.
 */
export function loadPlanning(repos: Repos): Planning {
  const terms = repos.settings.terms();
  const rows = repos.calendar.rows();
  const days = toCalendarDays(rows, terms, repos.corrections.labels());
  const timetables = repos.timetable.versions();
  const groups = repos.timetable.groups();
  const allSlots = buildSlots({ days, timetables, groups, disruptions: [] });
  const candidates = eventCandidates({ rows, days, groups, slots: allSlots });
  const classifications = repos.events.list();
  const disruptions = [
    ...repos.disruptions.list(),
    ...disruptionsFromEvents(candidates, classifications, groups),
  ];
  return {
    terms,
    days,
    timetables,
    groups,
    allSlots,
    candidates,
    classifications,
    disruptions,
    slots: buildSlots({ days, timetables, groups, disruptions }),
  };
}
