import type { SkillId } from "@planner/ai";
import type {
  CalendarRow,
  Course,
  CourseId,
  CoverChoice,
  CurriculumPack,
  Disruption,
  EventClassification,
  ExternalExam,
  FindingResolution,
  FlexEdit,
  Group,
  GroupOverride,
  HomeworkMode,
  LabelCorrection,
  LessonLogEntry,
  Merge,
  PaceHold,
  ParentsEvening,
  Pin,
  PlanRevision,
  Position,
  ReportWindow,
  ReviewState,
  Source,
  SowItem,
  Term,
  TimetableVersion,
  TodoNote,
} from "@planner/domain";
import type { ImportFinding } from "@planner/importers";

/** The text of a date cell as written, kept so Setup can list the ones that could not be read. */
export type StoredReportWindow = ReportWindow & {
  raw: {
    dataDeadline: string | null;
    hodReview: string | null;
    sentHome: string | null;
  };
};
export type StoredParentsEvening = ParentsEvening & { raw: string | null };

export interface StoredImport {
  id: number;
  fileName: string;
  fileHash: string;
  importedAt: string;
  findings: ImportFinding[];
}

export interface CalendarRepo {
  latestImport(): StoredImport | null;
  /** Sorted by date. */
  rows(): CalendarRow[];
  /** Replaces the stored calendar, report windows and parents' evenings wholesale. */
  replaceCalendar(input: {
    file: Omit<StoredImport, "id">;
    rows: CalendarRow[];
    windows: StoredReportWindow[];
    evenings: StoredParentsEvening[];
  }): void;
  /** Sorted by id. */
  windows(): StoredReportWindow[];
  /** Sorted by id. */
  evenings(): StoredParentsEvening[];
  /** Stores a corrected date. False when there is no such row. */
  setWindowDate(
    id: string,
    field: "dataDeadline" | "hodReview" | "sentHome",
    date: string,
  ): boolean;
  setEveningDate(id: string, date: string): boolean;
}

export interface TimetableRepo {
  /** Sorted by validFrom, then id. */
  versions(): TimetableVersion[];
  /** Sorted by id. */
  groups(): Group[];
  saveVersion(version: TimetableVersion): void;
  seed(versions: TimetableVersion[], groups: Group[]): void;
}

export interface SettingsRepo {
  /** Sorted by first day. Empty before the first run. */
  terms(): Term[];
  saveTerms(terms: Term[]): void;
  getFlag(key: string): boolean;
  setFlag(key: string): void;
}

/** A disruption as stored: which cancellation it came from, and when. */
export type StoredDisruption = Disruption & {
  batchId: string;
  createdAt: string;
};

export interface DisruptionRepo {
  /** Sorted by first day, then id. */
  list(): StoredDisruption[];
  add(rows: StoredDisruption[]): void;
  /** Removes every row of one cancellation. Returns how many rows went. */
  removeBatch(batchId: string): number;
}

/** Her corrections to the calendar. A new import never touches them. */
export interface CorrectionRepo {
  /** Sorted by date. */
  labels(): LabelCorrection[];
  /** Replaces any correction already on that date. */
  setLabel(correction: LabelCorrection, createdAt: string): void;
  /** False when there was none. */
  removeLabel(date: string): boolean;
  /** Sorted by date. */
  resolutions(): FindingResolution[];
  /** Replaces any resolution already on that date. */
  setResolution(resolution: FindingResolution, createdAt: string): void;
  /** False when there was none. */
  removeResolution(date: string): boolean;
}

/** Her confirmations of calendar events. A new import never touches them. */
export interface EventRepo {
  /** Sorted by id. */
  list(): EventClassification[];
  /** Replaces any confirmation with the same id. */
  upsert(classification: EventClassification, createdAt: string): void;
  /** False when there was none. */
  remove(id: string): boolean;
}

/** The official exams. Seeded once; after that they are hers to edit. */
export interface ExamRepo {
  /** Sorted by date, then code. */
  list(): ExternalExam[];
  /** Replaces any exam with the same id. A code already used by another exam throws. */
  upsert(exam: ExternalExam): void;
  /** False when there was none. */
  remove(id: string): boolean;
}

/** Her sticky notes on Today. */
export interface TodoRepo {
  /** Oldest first (created time, then id). */
  list(): TodoNote[];
  insert(note: TodoNote): void;
  /** Changes only the fields given. Null when there is no such note. */
  update(
    id: string,
    patch: { text?: string | undefined; done?: boolean | undefined },
  ): TodoNote | null;
  /** False when there was none. */
  remove(id: string): boolean;
}

/** One AI job. `failure` is a sentence for her, never an error code. */
export interface AiRun {
  id: string;
  skillId: SkillId;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  startedAt: string;
  durationMs: number | null;
  provider: string | null;
  model: string | null;
  failure: string | null;
  /** A sentence about a run that finished well but left something out. Never a failure. */
  note: string | null;
  itemIds: string[];
}

/** One thing an AI run suggested. It waits for her review. */
export interface AiItem {
  id: string;
  runId: string;
  kind: string;
  target: string;
  courseId: CourseId | null;
  data: unknown;
  review: ReviewState;
  reviewedAt: string | null;
  sources: Source[];
}

export interface AiRepo {
  insertRun(run: Omit<AiRun, "itemIds">): void;
  getRun(id: string): AiRun | null;
  /** Newest first (started time, then insertion order). */
  listRuns(): AiRun[];
  updateRun(
    id: string,
    patch: Partial<
      Pick<
        AiRun,
        "status" | "durationMs" | "provider" | "model" | "failure" | "note"
      >
    >,
  ): void;
  insertItem(item: AiItem): void;
  getItem(id: string): AiItem | null;
  /** In the order stored; every item, or only those in one review state. */
  listItems(filter?: { review?: ReviewState }): AiItem[];
  /**
   * Moves a suggested item to `review`, replacing its data when `data` is given.
   * Returns the item as it was, or null when it is not suggested any more (or does not exist).
   * Only one of two racing calls can win.
   */
  claimReview(
    id: string,
    review: Exclude<ReviewState, "suggested">,
    reviewedAt: string,
    data?: unknown,
  ): AiItem | null;
  /** Puts an item back as it was before `claimReview`. */
  restoreItem(item: AiItem): void;
  /** Marks every queued or running run as failed. Returns how many. */
  failUnfinished(failure: string): number;
}

/** Her courses. Seeded once, like the groups; she changes the revision weeks. */
export interface CourseRepo {
  /** Sorted by id. */
  list(): Course[];
  get(id: CourseId): Course | null;
  /** Adds the courses that are not stored yet; never changes one that is. */
  seed(courses: readonly Course[]): void;
  /** False when there is no such course. */
  setRevisionWeeks(id: CourseId, weeks: number): boolean;
}

/** A course's scheme of work: its items and the groups' own lesson counts. */
export interface SchemeRepo {
  /** Sorted by order, then id. */
  items(courseId: CourseId): SowItem[];
  /** Sorted by group, then item. */
  overrides(courseId: CourseId): GroupOverride[];
  /** Replaces both, together. */
  replace(
    courseId: CourseId,
    items: readonly SowItem[],
    overrides: readonly GroupOverride[],
  ): void;
}

/** Her decisions about one course's plan. Each list is sorted by its key. */
export interface Decisions {
  pins: Pin[];
  merges: Merge[];
  flexEdits: FlexEdit[];
  coverChoices: CoverChoice[];
  homework: HomeworkMode[];
  holds: PaceHold[];
}
export interface DecisionRepo {
  forCourse(courseId: CourseId): Decisions;
  /** Replaces every decision of one kind for the course. */
  replace<K extends keyof Decisions>(
    courseId: CourseId,
    kind: K,
    rows: Decisions[K],
  ): void;
}

/** Facts: where each group is, and what happened in her lessons. */
export interface FactRepo {
  /** Sorted by group. */
  positions(courseId: CourseId): Position[];
  /** Replaces the positions of the course's groups. */
  setPositions(courseId: CourseId, positions: readonly Position[]): void;
  /** Every entry for these groups, in the order recorded. */
  log(groupIds: readonly string[]): LessonLogEntry[];
  append(entries: readonly LessonLogEntry[]): void;
}

/** An attached file as stored: the row, not the bytes. The bytes are `data/materials/<storedName>`. */
export interface StoredMaterial {
  id: string;
  groupId: string;
  lessonId: string;
  /** Her file name, as text only. */
  name: string;
  /** `<uuid>.<ext>`, the only name used on disk. */
  storedName: string;
  contentType: string;
  size: number;
  createdAt: string;
}

/** A content lesson's note and files. A row exists while there is a note or a file. */
export interface StoredLessonNote {
  groupId: string;
  lessonId: string;
  /** Plain text, possibly empty when only files are attached. */
  text: string;
  /** The lesson's name when she last wrote to it. */
  title: string;
  updatedAt: string;
  materials: StoredMaterial[];
}

/** Her plan for each content lesson, and the files attached to it. Never read by a model. */
export interface LessonNoteRepo {
  get(groupId: string, lessonId: string): StoredLessonNote | null;
  /** Every lesson that has a note or a file, by group then lesson id. */
  list(): StoredLessonNote[];
  /** Stores the text. An empty text with no files removes the row. */
  saveText(
    groupId: string,
    lessonId: string,
    text: string,
    title: string,
    now: string,
  ): void;
  /** Stores the row for a file, creating the lesson's row first if there is none. */
  addMaterial(material: StoredMaterial, title: string): void;
  material(id: string): StoredMaterial | null;
  /** Removes the row and returns it; the lesson's row goes too when nothing is left in it. */
  removeMaterial(id: string): StoredMaterial | null;
}

/** Accepted plans: one per course (the plan id is the course id), as immutable revisions. */
export interface PlanRepo {
  head(planId: string): PlanRevision | null;
  get(revisionId: string): PlanRevision | null;
  /** Every plan with a head, by plan id. */
  heads(): PlanRevision[];
  /** Stores a new revision and makes it the head, together. */
  insertHead(revision: PlanRevision, courseId: CourseId): void;
  /** Moves the head to a revision already stored. */
  setHead(planId: string, revisionId: string): void;
}

/**
 * Curriculum packs, as JSON files in `data/packs/` (`<courseId>.draft.json` and
 * `<courseId>.json`). The database keeps only the hash of the pack she locked.
 * Reading a locked pack compares the `hash` field written in its file with that
 * stored hash; it does not recompute the hash from the file's content (the lock
 * route does, with `lockPack`). A file that is not a pack is a 422, never guessed at.
 */
/**
 * What the model said beside a draft pack: why each chapter links to a spec point, what it was
 * unsure of, and which run made it. `pnpm pack:draft` writes it as `<courseId>.draft-review.json`.
 */
export interface PackDraftNotes {
  linkReasons: { chapterNumber: string; specPointId: string; reason: string }[];
  unsure: { about: string; note: string }[];
  meta: {
    provider: string;
    model: string;
    skillId: string;
    startedAt: string;
    sources: { url: string; title: string | null; opened: boolean }[];
  } | null;
  /** Ids of the units she has marked as checked. Locking needs every in-scope unit here. */
  checkedUnits: string[];
}

export interface PackStore {
  draft(courseId: CourseId): CurriculumPack | null;
  /** The notes saved beside the draft, or null when there are none. A file that is not notes is a 422. */
  draftReview(courseId: CourseId): PackDraftNotes | null;
  /** Writes the notes beside the draft (the browser-test seed; `pnpm pack:draft` writes its own file). */
  saveDraftReview(courseId: CourseId, notes: PackDraftNotes): void;
  /** Replaces the checked unit ids in the notes file, making the file (with empty notes) if there is none. */
  saveCheckedUnits(courseId: CourseId, unitIds: string[]): void;
  /** The locked pack, or null when there is none or the `hash` field in its file differs from the stored hash. */
  locked(courseId: CourseId): CurriculumPack | null;
  saveDraft(pack: CurriculumPack): void;
  /** Writes the file and the hash. The pack must be locked (`lockPack`). */
  saveLocked(pack: CurriculumPack): void;
  /** Removes every pack file (the browser-test reset). */
  clear(): void;
}

export interface Repos {
  calendar: CalendarRepo;
  timetable: TimetableRepo;
  settings: SettingsRepo;
  disruptions: DisruptionRepo;
  corrections: CorrectionRepo;
  events: EventRepo;
  exams: ExamRepo;
  todos: TodoRepo;
  lessonNotes: LessonNoteRepo;
  ai: AiRepo;
  courses: CourseRepo;
  scheme: SchemeRepo;
  decisions: DecisionRepo;
  facts: FactRepo;
  plans: PlanRepo;
  /** Everything inside `fn` is stored together or not at all. */
  transaction<T>(fn: () => T): T;
}
