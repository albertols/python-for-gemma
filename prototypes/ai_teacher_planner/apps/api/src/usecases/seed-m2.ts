import { syntheticPack, syntheticScheme } from "@planner/fixtures";
import { lockPack } from "@planner/importers";
import type { PackStore, Repos } from "../repos/ports.ts";
import { acceptPlan } from "./accept-plan.ts";
import { savePositions } from "./positions.ts";
import { proposePlan } from "./propose-plan.ts";
import { saveScheme } from "./scheme.ts";

/** The browser-test states past M1b. "m1b" has no M2 data at all. */
export const SEED_STATES = [
  "m1b",
  "m2-draft-pack",
  "m2-no-positions",
  "m2-planned",
] as const;
export type SeedState = (typeof SEED_STATES)[number];

const COURSE = "ial-business-u4";
/** The first plan is made as if on this day, so that by 20 Nov three weeks wait in the check-in. */
const PLANNED_ON = "2026-10-26";
const GROUPS = ["13 1", "13 3", "13 5"];

/**
 * Fills the synthetic M2 data for the IAL course, through the same use cases
 * the routes call, up to `state` (default: everything):
 * - "m2-draft-pack": a draft of the synthetic pack in which spec point 1.5 is linked to no chapter;
 * - "m2-no-positions": the synthetic pack locked and the synthetic scheme, no positions;
 * - "m2-planned": also every Year 13 group at ch1#1 on 26 Oct 2026, and a first
 *   plan accepted as computed on that day.
 * The database must hold the seed (firstRun) and the synthetic calendar already.
 */
export async function seedM2(
  repos: Repos,
  packs: PackStore,
  now: () => Date,
  state: Exclude<SeedState, "m1b"> = "m2-planned",
): Promise<void> {
  const pack = { ...syntheticPack(), courseId: COURSE };
  if (state === "m2-draft-pack") {
    packs.saveDraft({
      ...pack,
      chapters: pack.chapters.map((c) =>
        c.id === "ch5" ? { ...c, specPointIds: [] } : c,
      ),
    });
    // An invented review block, as `pnpm pack:draft` would save it: a reason for a link, and a doubt.
    packs.saveDraftReview(COURSE, {
      linkReasons: [
        {
          chapterNumber: "1",
          specPointId: "sp1",
          reason: "The chapter opens with the demand curve this point names.",
        },
      ],
      unsure: [
        {
          about: "Invented point 5",
          note: "No chapter seemed to cover this point. It may sit in a later chapter.",
        },
      ],
      meta: {
        provider: "fake",
        model: "fake",
        skillId: "planner-build-curriculum-pack",
        startedAt: "2026-11-24T09:00:00.000Z",
        sources: [],
      },
    });
    return;
  }
  packs.saveDraft(pack);
  packs.saveLocked(await lockPack(pack, now()));
  saveScheme(repos, packs, COURSE, syntheticScheme(COURSE), []);
  if (state === "m2-no-positions") return;
  savePositions(
    repos,
    COURSE,
    GROUPS.map((groupId) => ({
      groupId,
      nextLessonId: "ch1#1",
      doneItemIds: [],
      asOf: PLANNED_ON,
    })),
  );
  const proposal = proposePlan(repos, packs, COURSE, PLANNED_ON);
  acceptPlan(
    repos,
    packs,
    COURSE,
    PLANNED_ON,
    { baseRevisionId: null, candidateKey: proposal.candidateKey },
    { id: "r:seed-first-plan", createdAt: now().toISOString() },
  );
}
