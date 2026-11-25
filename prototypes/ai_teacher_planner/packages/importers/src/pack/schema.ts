import type { CurriculumPack } from "@planner/domain";
import { z } from "zod";

const unit = z.strictObject({
  id: z.string().min(1),
  code: z.string(),
  title: z.string(),
  inScope: z.boolean(),
});

const specPoint = z.strictObject({
  id: z.string().min(1),
  unitId: z.string().min(1),
  code: z.string(),
  title: z.string(),
  level: z.enum(["core", "hl-only"]),
  page: z.number().int().positive().nullable(),
});

const chapter = z.strictObject({
  id: z.string().min(1),
  unitId: z.string().min(1),
  number: z.string(),
  title: z.string(),
  specPointIds: z.array(z.string()),
  hlOnly: z.boolean(),
  page: z.number().int().positive().nullable(),
});

/** Shape only. Whether the references line up is domain's packIssues. */
export const curriculumPackSchema: z.ZodType<CurriculumPack> = z.strictObject({
  schemaVersion: z.literal(1),
  courseId: z.string().min(1),
  board: z.string(),
  subject: z.string(),
  version: z.string(),
  units: z.array(unit),
  specPoints: z.array(specPoint),
  chapters: z.array(chapter),
  source: z.strictObject({
    fileName: z.string(),
    pages: z.number().int().nonnegative(),
  }),
  lockedAt: z.string().nullable(),
  hash: z.string().nullable(),
});
