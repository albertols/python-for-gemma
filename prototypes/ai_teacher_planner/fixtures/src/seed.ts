import type { Group, TimetableVersion } from "@planner/domain";
import groupsJson from "../groups.2026-27.json" with { type: "json" };
import timetableJson from "../timetable.2026-27.json" with { type: "json" };

/** Gemma's two-week timetable from 31 Aug 2026 (spec appendix A). Lessons and study-hall duties only. */
export const SEED_TIMETABLE: TimetableVersion =
  timetableJson as TimetableVersion;

/** Her six groups, with a colour token name that Task 1.9 gives a value. */
export const SEED_GROUPS: Group[] = groupsJson as Group[];
