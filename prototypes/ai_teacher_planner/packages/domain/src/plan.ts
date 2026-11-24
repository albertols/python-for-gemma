// Types only, as in the plan index contract. Task 2.2 adds `sequence` beside them.
import type { TeachingBlock } from "./calendar.ts";
import type { IsoDate } from "./dates.ts";
import type { ExternalExam } from "./exams.ts";
import type { LessonId } from "./lessons.ts";
import type { GroupOverride, SowItem } from "./scheme.ts";
import type { Slot, SlotKey } from "./slots.ts";
import type { CourseId, Group, GroupId } from "./timetable.ts";

export type Pin =
  | {
      id: string;
      groupId: GroupId;
      lessonId: LessonId;
      kind: "slot";
      slotKey: SlotKey;
    }
  | {
      id: string;
      groupId: GroupId;
      lessonId: LessonId;
      kind: "not-after";
      date: IsoDate;
    };
export interface Merge {
  id: string;
  groupId: GroupId;
  first: LessonId;
  second: LessonId;
}
export interface Position {
  groupId: GroupId;
  nextLessonId: LessonId | null;
  doneItemIds: string[];
  asOf: IsoDate;
}
export interface LessonLogEntry {
  groupId: GroupId;
  lessonId: LessonId;
  slotKey: SlotKey | null;
  outcome: "taught" | "cover" | "skipped" | "homework";
  recordedOn: IsoDate;
  note: string | null;
}
export interface CoverChoice {
  slotKey: SlotKey;
  choice: "keep" | "swap" | "lost";
  swapLessonId: LessonId | null;
}
export interface HomeworkMode {
  groupId: GroupId;
  lessonId: LessonId;
}
export interface PaceHold {
  id: string;
  checkpointId: string;
  firstDeferredLessonId: LessonId;
}
export interface FlexEdit {
  flexId: LessonId;
  title: string | null;
  purpose:
    | "exam-practice"
    | "support"
    | "independent-study"
    | "revision"
    | null;
}
export type PlacementState =
  | "planned"
  | "assumed"
  | "taught"
  | "cover"
  | "homework"
  | "skipped"
  | "declared";
export interface Placement {
  groupId: GroupId;
  lessonId: LessonId;
  slotKey: SlotKey | null;
  state: PlacementState;
  pinned: boolean;
  mergedInto: LessonId | null;
  viaCover: boolean;
}
export interface AssessmentPlacement {
  groupId: GroupId;
  itemId: string;
  slotKey: SlotKey;
  slotUse: "whole" | "in-lesson";
}
export interface Checkpoint {
  id: string;
  kind: "assessment" | "block-end" | "revision" | "exam";
  date: IsoDate;
  label: string;
  itemId: string | null;
  perGroupDate?: Record<GroupId, IsoDate>;
}
export interface Overflow {
  checkpointId: string;
  groupId: GroupId;
  lessonIds: LessonId[];
}
export type Conflict =
  | {
      kind: "assessment-no-slot";
      groupId: GroupId;
      itemId: string;
      date: IsoDate;
    }
  | {
      kind: "pin-slot-unavailable";
      pinId: string;
      groupId: GroupId;
      lessonId: LessonId;
      slotKey: SlotKey;
    }
  | {
      kind: "not-after-missed";
      pinId: string;
      groupId: GroupId;
      lessonId: LessonId;
      date: IsoDate;
      plannedDate: IsoDate | null;
    }
  | {
      kind: "hl-prerequisite";
      groupId: GroupId;
      lessonId: LessonId;
      prerequisiteItemId: string;
      finishesOn: IsoDate | null;
    };
export interface PlanSnapshot {
  courseId: CourseId;
  today: IsoDate;
  placements: Placement[];
  assessments: AssessmentPlacement[];
  checkpoints: Checkpoint[];
  overflow: Overflow[];
  absorbed: { groupId: GroupId; lessonId: LessonId }[];
  conflicts: Conflict[];
}
export interface PlanInputs {
  courseId: CourseId;
  today: IsoDate;
  groups: Group[];
  slots: Slot[];
  blocks: TeachingBlock[];
  items: SowItem[];
  overrides: GroupOverride[];
  positions: Position[];
  log: LessonLogEntry[];
  pins: Pin[];
  merges: Merge[];
  coverChoices: CoverChoice[];
  homework: HomeworkMode[];
  holds: PaceHold[];
  flexEdits: FlexEdit[];
  previous: PlanSnapshot | null;
  exams: ExternalExam[];
  revisionWeeks: number;
}
