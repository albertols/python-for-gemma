import { z } from "@hono/zod-openapi";
import {
  type CurriculumPack,
  isIsoDate,
  type PlanInputs,
  type PlanSnapshot,
  type Proposal,
} from "@planner/domain";

export const isoDate = z
  .string()
  .refine(isIsoDate, "must be a real date written like 2026-11-20")
  .openapi({ example: "2026-11-20" });
export const weekLabel = z.enum(["W1", "W2"]);
const weekday = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
]);
export const period = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);
export const yearGroup = z.union([
  z.literal(7),
  z.literal(8),
  z.literal(9),
  z.literal(10),
  z.literal(11),
  z.literal(12),
  z.literal(13),
]);

export const errorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    issues: z.array(z.string()).optional(),
  }),
});
export const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: errorBody } },
});

export const term = z.object({
  id: z.enum(["T1", "T2", "T3"]),
  firstPupilDay: isoDate,
  lastPupilDay: isoDate,
});
export const calendarDay = z.object({
  date: isoDate,
  weekLabel: weekLabel.nullable(),
  labelSource: z.enum(["calendar", "teacher"]),
  kind: z.enum(["pupil", "weekend", "outside-term", "unlabelled", "holiday"]),
  pupilDay: z.boolean(),
  text: z.string().nullable(),
});
export const timetableEntry = z.object({
  week: weekLabel,
  weekday,
  period,
  groupId: z.string(),
  room: z.string().nullable(),
});
export const dutyEntry = z.object({
  week: weekLabel,
  weekday,
  period,
  label: z.string(),
});
export const timetableVersion = z.object({
  id: z.string(),
  validFrom: isoDate,
  entries: z.array(timetableEntry),
  duties: z.array(dutyEntry),
});
export const group = z.object({
  id: z.string(),
  yearGroup,
  programme: z.enum(["IGCSE", "IB", "A level"]),
  courseId: z.string(),
  track: z.enum(["core", "hl"]),
  colour: z.string(),
});
export const slot = z.object({
  key: z.string(),
  groupId: z.string(),
  date: isoDate,
  period,
  weekLabel,
  room: z.string().nullable(),
  status: z.enum(["open", "cancelled", "cover"]),
  reasons: z.array(
    z.object({
      disruptionId: z.string(),
      text: z.string(),
      source: z.enum(["calendar", "teacher"]),
    }),
  ),
  doubleWith: z.string().nullable(),
});
export const reminder = z.object({
  kind: z.enum(["report-data-deadline", "parents-evening", "exam"]),
  date: isoDate,
  daysLeft: z.number(),
  label: z.string(),
  groupIds: z.array(z.string()),
});

export const dateRangeQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

const disruptionScope = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("school") }),
  z.object({ kind: z.literal("year"), yearGroup }),
  z.object({ kind: z.literal("group"), groupId: z.string() }),
  z.object({ kind: z.literal("teacher") }),
]);
export const storedDisruption = z.object({
  id: z.string(),
  batchId: z.string(),
  scope: disruptionScope,
  from: isoDate,
  to: isoDate,
  periods: z.array(period).nullable(),
  effect: z.enum(["cancelled", "cover"]),
  reason: z.string(),
  source: z.enum(["calendar", "teacher"]),
  createdAt: z.string(),
});
/** What she fills in. The use case checks the reason, so a preview works while she is still typing it. */
export const disruptionInput = z.object({
  scope: z.enum(["school", "year", "groups"]),
  yearGroup: yearGroup.optional(),
  groupIds: z.array(z.string()).optional(),
  from: isoDate,
  to: isoDate,
  periods: z.array(period).nullable(),
  reason: z.string(),
});

export const eventClassification = z.object({
  id: z.string(),
  wordingKey: z.string(),
  yearGroup: yearGroup.nullable(),
  onlyDates: z.array(isoDate).nullable(),
  decision: z.enum(["cancels", "no-effect"]),
  groupIds: z.array(z.string()).nullable(),
  periods: z.array(period).nullable(),
  until: isoDate.nullable(),
  provenance: z.enum(["engine", "ai", "teacher", "import"]),
});
/** What she decides; the id is in the address and the provenance is always "teacher". */
/** The dates are always the explicit list she saw, never "every date", so a date added by a later import is not cancelled unconfirmed. */
export const eventClassificationInput = eventClassification
  .omit({ id: true, provenance: true })
  .extend({ onlyDates: z.array(isoDate) });
export const eventCandidate = z.object({
  wordingKey: z.string(),
  text: z.string(),
  column: z.enum(["secondary", "events", "assessments"]),
  yearGroup: yearGroup.nullable(),
  dates: z.array(isoDate),
  presort: z.object({
    category: z.enum([
      "staff-only",
      "mock-exams",
      "external-exam",
      "study-leave",
      "coursework",
      "half-day",
      "trip",
      "assembly",
      "meeting",
      "other",
    ]),
    suggestion: z.enum(["cancels", "no-effect", "unsure"]),
    rule: z.string().nullable(),
  }),
});

/** The text limits (120 and 20) are checked by the use case, which says why in her words. */
export const examInput = z.object({
  code: z.string(),
  title: z.string(),
  date: isoDate,
  session: z.enum(["morning", "afternoon"]),
  durationMinutes: z.number().int(),
  groupIds: z.array(z.string()),
  source: z.string().nullable(),
});
export const exam = examInput.extend({ id: z.string() });

export const todoNote = z.object({
  id: z.string(),
  text: z.string(),
  scope: z.enum(["day", "week"]),
  date: isoDate,
  done: z.boolean(),
  createdAt: z.string(),
});
/** The text is checked by the use case, so the 200-character rule has one home. */
export const todoInput = z.object({
  text: z.string(),
  scope: z.enum(["day", "week"]),
  date: isoDate,
});
export const todoPatch = z.object({
  text: z.string().optional(),
  done: z.boolean().optional(),
});
export const todoLists = z.object({
  today: z.array(todoNote),
  week: z.array(todoNote),
  stillToDo: z.array(todoNote),
});

// ---- M2: courses, packs, scheme, positions, plans ----

/** Engine shapes the API only passes through; their TypeScript type comes from the domain. */
const passThrough = <T>(description: string) =>
  z.custom<T>(() => true).openapi({ type: "object", description });

export const planSnapshot = passThrough<PlanSnapshot>(
  "A PlanSnapshot (packages/domain plan.ts)",
);
export const planInputs = passThrough<PlanInputs>(
  "The PlanInputs for today (packages/domain plan.ts), for fitFor in the browser",
);
export const proposal = passThrough<Proposal & { candidateKey: string }>(
  "A Proposal (packages/domain revisions.ts) and the key of its candidate",
);
export const curriculumPack = passThrough<CurriculumPack>(
  "A CurriculumPack (packages/domain pack.ts)",
);

export const draftNotes = z.object({
  linkReasons: z.array(
    z.object({
      chapterNumber: z.string(),
      specPointId: z.string(),
      reason: z.string(),
    }),
  ),
  unsure: z.array(z.object({ about: z.string(), note: z.string() })),
  meta: z
    .object({
      provider: z.string(),
      model: z.string(),
      skillId: z.string(),
      startedAt: z.string(),
      sources: z.array(
        z.object({
          url: z.string(),
          title: z.string().nullable(),
          opened: z.boolean(),
        }),
      ),
    })
    .nullable(),
});

const origin = z.enum(["engine", "ai", "teacher", "import"]);
export const provenance = z.object({
  origin,
  ai: z
    .object({
      runId: z.string(),
      provider: z.string(),
      model: z.string(),
      skillId: z.string(),
      at: z.string(),
      sources: z.array(
        z.object({
          url: z.string(),
          title: z.string().nullable(),
          opened: z.boolean(),
        }),
      ),
      review: z.enum(["suggested", "accepted", "edited", "rejected"]),
    })
    .nullable(),
});

export const course = z.object({
  id: z.string(),
  title: z.string(),
  board: z.enum(["IAL", "IB", "IGCSE"]),
  revisionWeeks: z.number().int().nonnegative(),
});

const wholeCount = z.number().int();
export const sowItem = z.object({
  id: z.string().min(1),
  courseId: z.string().min(1),
  order: z.number(),
  kind: z.enum(["teaching", "project", "revision", "buffer", "assessment"]),
  title: z.string(),
  lessons: wholeCount,
  track: z.enum(["core", "hl"]),
  packRefs: z.array(z.string()),
  prerequisites: z.array(z.string()),
  availableFrom: isoDate.nullable(),
  note: z.string().nullable(),
  assessment: z
    .object({
      date: isoDate.nullable(),
      type: z.string(),
      marks: z.number().int().nonnegative().nullable(),
      /** Whole minutes: a computed default with half a minute is rounded up before it is stored. */
      durationMinutes: z.number().int().positive().nullable(),
      slotUse: z.enum(["whole", "in-lesson"]),
      status: z.enum(["planned", "sat"]),
      covers: z.array(z.string()),
    })
    .nullable(),
  provenance,
});
export const groupOverride = z.object({
  groupId: z.string(),
  itemId: z.string(),
  lessons: wholeCount,
});
export const position = z.object({
  groupId: z.string(),
  nextLessonId: z.string().nullable(),
  doneItemIds: z.array(z.string()),
  asOf: isoDate,
});
export const planRevision = z.object({
  id: z.string(),
  planId: z.string(),
  parentId: z.string().nullable(),
  label: z.string(),
  createdAt: z.string(),
  snapshot: planSnapshot,
});
export const planStatus = z.object({
  head: planRevision.nullable(),
  canUndo: z.boolean(),
  upToDate: z.boolean(),
});

const placementState = z.enum([
  "planned",
  "assumed",
  "taught",
  "cover",
  "homework",
  "skipped",
  "declared",
]);
export const placementView = z.object({
  courseId: z.string(),
  groupId: z.string(),
  lessonId: z.string(),
  slotKey: z.string().nullable(),
  date: isoDate,
  period: z.number().int(),
  state: placementState,
  pinned: z.boolean(),
  mergedInto: z.string().nullable(),
  viaCover: z.boolean(),
  itemId: z.string().nullable(),
  index: z.number().int().nullable(),
  of: z.number().int().nullable(),
  title: z.string(),
  kind: z.enum([
    "teaching",
    "project",
    "revision",
    "buffer",
    "assessment",
    "flex",
  ]),
  provenance,
});
export const assessmentView = z.object({
  courseId: z.string(),
  groupId: z.string(),
  itemId: z.string(),
  slotKey: z.string(),
  date: isoDate,
  period: z.number().int(),
  slotUse: z.enum(["whole", "in-lesson"]),
  title: z.string(),
  provenance,
});
