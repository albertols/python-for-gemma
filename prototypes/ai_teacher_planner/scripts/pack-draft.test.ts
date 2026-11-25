import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  SYNTHETIC_SPEC_PATH,
  syntheticGateway,
} from "../apps/api/src/test-support.ts";
import { FakeAiProvider } from "../packages/ai/src/fake.ts";
import { curriculumPackSchema } from "../packages/importers/src/pack/schema.ts";
import { saveDraftPack } from "./pack-draft.ts";

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

const output = {
  units: [
    { id: "u1", code: "Unit 1", title: "Markets and prices", inScope: true },
  ],
  specPoints: [
    {
      id: "sp1",
      unitId: "u1",
      code: "1.1",
      title: "Demand and the demand curve",
      level: "core",
      page: 1,
    },
  ],
  chapters: [
    {
      number: "1",
      unitId: "u1",
      links: [
        {
          specPointId: "sp1",
          reason: '"Demand" matches "1.1 Demand and the demand curve"',
        },
      ],
    },
  ],
  unsure: [],
};

test("the draft is saved as data/packs/<course>.draft.json, valid and unlocked, with its review notes beside it", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pack-draft-"));
  made.push(dataDir);
  const done = await saveDraftPack({
    dataDir,
    gateway: await syntheticGateway(),
    ai: new FakeAiProvider({ "planner-build-curriculum-pack": output }),
    args: {
      courseId: "syn-econ",
      specPath: SYNTHETIC_SPEC_PATH,
      unitsInScope: ["Unit 1"],
      chapters: [{ number: "1", title: "Demand" }],
    },
  });
  expect(done.packFile).toBe(
    path.join(dataDir, "packs", "syn-econ.draft.json"),
  );
  const pack = JSON.parse(fs.readFileSync(done.packFile, "utf8"));
  expect(curriculumPackSchema.safeParse(pack).success).toBe(true);
  expect(pack.lockedAt).toBeNull();
  expect(pack.chapters[0].specPointIds).toEqual(["sp1"]);
  const review = JSON.parse(fs.readFileSync(done.reviewFile, "utf8"));
  expect(review.linkReasons).toEqual([
    {
      chapterNumber: "1",
      specPointId: "sp1",
      reason: '"Demand" matches "1.1 Demand and the demand curve"',
    },
  ]);
  expect(review.issues).toEqual([]);
  expect(review.meta.skillId).toBe("planner-build-curriculum-pack");
});

test("a course id that is not one plain file name is refused before anything is written", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pack-draft-"));
  made.push(dataDir);
  await expect(
    saveDraftPack({
      dataDir,
      gateway: await syntheticGateway(),
      ai: new FakeAiProvider({ "planner-build-curriculum-pack": output }),
      args: {
        courseId: "../escape",
        specPath: SYNTHETIC_SPEC_PATH,
        unitsInScope: ["Unit 1"],
        chapters: [{ number: "1", title: "Demand" }],
      },
    }),
  ).rejects.toThrow(/course id/);
  expect(fs.existsSync(path.join(dataDir, "packs"))).toBe(false);
});
