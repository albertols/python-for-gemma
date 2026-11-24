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
  kind: z.enum(["pupil", "weekend", "outside-term", "unlabelled"]),
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
