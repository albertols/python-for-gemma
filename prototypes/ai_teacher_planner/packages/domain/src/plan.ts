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
/** A note on a lesson-log answer: at most this many characters. */
export const LOG_NOTE_LIMIT = 200;
export interface LessonLogEntry {
  /**
   * The order the entry was written in (the lesson_log row id): it only grows.
   * For one placement the entry with the highest `seq` wins; `recordedOn` plays
   * no part in that choice.
   */
  seq: number;
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
/**
 * Lessons a group could not fit before a checkpoint. Before the final content
 * checkpoint (revision, else the first official exam, else the last checkpoint)
 * this means "short there": the lessons are first in line after it and are
 * usually placed later, so one lesson can be listed at several checkpoints. A
 * lesson is never placed when it has no placement in the snapshot, which means
 * it was not placed by the final content checkpoint. Count distinct lessons.
 */
export interface Overflow {
  /** Null when the plan has no checkpoint at all (no teaching block ends on or after today). */
  checkpointId: string | null;
  groupId: GroupId;
  lessonIds: LessonId[];
}
export type Conflict =
  | {
      kind: "assessment-no-slot";
      groupId: GroupId;
      itemId: string;
      /** The assessment's own date. An undated assessment that finds no slot is dated today (the day of the plan). */
      date: IsoDate;
    }
  | {
      /** Her position names a lesson that is not in the group's scheme; nothing is planned for the group. */
      kind: "position-unknown";
      groupId: GroupId;
      lessonId: LessonId;
    }
  | {
      /** A pin names a lesson that is not in the group's scheme. `slotKey` is null for a not-after pin. */
      kind: "pin-lesson-unknown";
      pinId: string;
      groupId: GroupId;
      lessonId: LessonId;
      slotKey: SlotKey | null;
    }
  | {
      /**
       * A slot pin would move a lesson that is inside the freeze horizon (today
       * and the next teaching day). It stays where it is. Message: "This lesson
       * is in the next two teaching days, so it stays where it is." `slotKey` is the slot the pin asked for.
       */
      kind: "pin-frozen";
      pinId: string;
      groupId: GroupId;
      lessonId: LessonId;
      slotKey: SlotKey;
    }
  | {
      /**
       * A dated assessment inside the freeze horizon was given a date that points
       * to another slot. It stays on its frozen slot. Message: "This assessment is
       * in the next two teaching days, so it stays where it is." `date` is the new
       * date, `slotKey` the slot it stays on.
       */
      kind: "anchor-frozen";
      groupId: GroupId;
      itemId: string;
      date: IsoDate;
      slotKey: SlotKey;
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
  /**
   * Buffer lessons dropped to make room, with the checkpoint whose window they
   * made room in. Once that checkpoint is before today the lesson is used up:
   * later plans carry the entry as it is and never plan the lesson again.
   */
  absorbed: { groupId: GroupId; lessonId: LessonId; checkpointId: string }[];
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
  /** Any order: the engine sorts by `seq`. */
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
