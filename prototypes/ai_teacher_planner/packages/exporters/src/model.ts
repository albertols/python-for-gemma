import type {
  GroupId,
  IsoDate,
  Period,
  PlacementState,
  Provenance,
} from "@planner/domain";

/**
 * One lesson (or assessment) as an export shows it. `state` is the state the
 * board shows (her log entry, then the stored state, then "assumed" for a past
 * planned lesson), never a state worked out again here. No student data.
 */
export interface ExportLesson {
  groupId: GroupId;
  date: IsoDate;
  period: Period;
  room: string | null;
  title: string;
  state: PlacementState;
  provenance: Provenance;
}

/**
 * Anything with a provenance that is not a lesson in the export but would have
 * been in it (an AI suggestion still awaiting her review for a course in the
 * export). Only its provenance is read.
 */
export interface HeldBack {
  provenance: Provenance;
}

export interface FortnightExport {
  /** The Mondays of Week 1 and Week 2; either can be missing. */
  w1: IsoDate | null;
  w2: IsoDate | null;
  lessons: ExportLesson[];
  generatedOn: IsoDate;
  /** Left out as well as any lesson that is not exportable, and counted in the warning. */
  heldBack?: readonly HeldBack[];
}
