import { z } from "@hono/zod-openapi";
import { isIsoDate } from "@planner/domain";

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
  kind: z.enum(["report-data-deadline", "parents-evening"]),
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
