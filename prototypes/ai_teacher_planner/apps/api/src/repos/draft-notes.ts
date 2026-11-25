import { z } from "zod";
import type { PackDraftNotes } from "./ports.ts";

/**
 * The one schema for `<courseId>.draft-review.json`, as the store reads it and the API sends it.
 * Other fields `pnpm pack:draft` writes (issues, durationMs) are left out. A file with no
 * `checkedUnits` has none ticked: a new draft replaces the whole file, so its ticks go with it.
 */
export const draftNotesSchema = z.object({
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
    .nullable()
    .default(null),
  checkedUnits: z.array(z.string()).default([]),
}) satisfies z.ZodType<PackDraftNotes, unknown>;
