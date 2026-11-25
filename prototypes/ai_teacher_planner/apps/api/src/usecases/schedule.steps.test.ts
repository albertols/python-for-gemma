import fs from "node:fs";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import {
  bySlotOrder,
  type CurriculumPack,
  expandLessons,
  type PlanInputs,
  type PlanSnapshot,
  sequence,
  toCalendarDays,
} from "@planner/domain";
import {
  buildSyntheticPlanningSheet,
  buildSyntheticSchedule,
  featureFile,
  SEED_TERMS,
  syntheticPack,
  syntheticRows,
} from "@planner/fixtures";
import { lockPack, readPlanningSheet } from "@planner/importers";
import { afterAll, expect } from "vitest";
import { seededRepos, syntheticGateway } from "../test-support.ts";
import { createDisruption } from "./disruptions.ts";
import { importScheme } from "./import-scheme.ts";
import { loadPlanInputs } from "./plan-inputs.ts";
import { savePositions } from "./positions.ts";
import { saveScheme } from "./scheme.ts";

// Scenario 5 on the whole synthetic year, with nothing built by hand: her
// planning sheet and assessment schedule are written as files, imported through
// the gateway into the scheme, and the plan is made from the database
// (loadPlanInputs, sequence), so her cancellations are in the slots too.
// Task 2.3's packages/domain/src/schedule.steps.test.ts keeps the domain-only
// version on paceWorld().
const COURSE = "ial-business-u4";
const GROUPS = ["13 1", "13 3", "13 5"];
const TODAY = "2026-11-09";
const SHEET = "ial/Planning/Synthetic Planning.xlsx";
const DOC = "ial/Planning/Synthetic Schedule.docx";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

const feature = await loadFeature(featureFile("05-schedule-from-documents"));
describeFeature(feature, ({ Scenario }) => {
  Scenario(
    "Story 1: a schedule from my documents",
    ({ Given, When, Then, And }) => {
      let world: PlanInputs;
      let plan: PlanSnapshot;
      let pack: CurriculumPack;
      let sheetTotal = 0;
      const days = toCalendarDays(syntheticRows(), SEED_TERMS);
      const slotOf = () => new Map(world.slots.map((s) => [s.key, s]));
      const planned = () =>
        plan.placements.filter(
          (p) => p.slotKey !== null && p.state === "planned",
        );

      Given(
        "the calendar, my timetable and the IAL Unit 4 scheme with my class counts",
        async () => {
          const { repos, packs, dataDir } = await seededRepos("m1b");
          dirs.push(dataDir);
          pack = { ...syntheticPack(), courseId: COURSE };
          packs.saveDraft(pack);
          pack = await lockPack(pack, new Date("2026-11-24T10:00:00Z"));
          packs.saveLocked(pack);
          const sheet = await buildSyntheticPlanningSheet();
          sheetTotal = (await readPlanningSheet(sheet)).sum;
          const gateway = await syntheticGateway({
            [SHEET]: sheet,
            [DOC]: await buildSyntheticSchedule(),
          });
          const preview = await importScheme(
            { repos, packs, gateway },
            COURSE,
            { planningFile: SHEET, scheduleFile: DOC },
            TODAY,
          );
          saveScheme(repos, packs, COURSE, preview.items, []);
          savePositions(
            repos,
            COURSE,
            GROUPS.map((groupId) => ({
              groupId,
              nextLessonId: "ch1#1",
              doneItemIds: [],
              asOf: TODAY,
            })),
          );
          // A trip takes 13 1's lessons on Monday 23 Nov, so the disruptions are in the slots.
          createDisruption(
            repos,
            {
              scope: "groups",
              groupIds: ["13 1"],
              from: "2026-11-23",
              to: "2026-11-23",
              periods: null,
              reason: "Trip",
            },
            new Date("2026-11-09T10:00:00Z"),
          );
          world = loadPlanInputs(repos, packs, COURSE, TODAY);
          expect(world.groups.map((g) => g.id)).toEqual(GROUPS);
        },
      );
      When("I choose 13 1, 13 3 and 13 5 and my teaching order", () => {
        plan = sequence(world);
      });
      Then(
        "I see a dated schedule per group in which every lesson sits on a real lesson of that group",
        () => {
          const slots = slotOf();
          for (const g of GROUPS)
            expect(
              planned().filter((p) => p.groupId === g).length,
            ).toBeGreaterThan(0);
          for (const p of planned()) {
            const slot = slots.get(p.slotKey ?? "");
            expect(slot?.groupId).toBe(p.groupId);
            expect(slot?.status).toBe("open");
          }
        },
      );
      And("no lesson falls on a holiday", () => {
        const pupil = new Set(
          days.filter((d) => d.pupilDay).map((d) => d.date),
        );
        const slots = slotOf();
        for (const p of planned())
          expect(pupil.has(slots.get(p.slotKey ?? "")?.date ?? "")).toBe(true);
        // 8 December 2026 is an official holiday.
        expect(planned().some((p) => p.slotKey?.includes("|2026-12-08|"))).toBe(
          false,
        );
        // The trip cancelled 13 1's lessons on 23 November.
        expect(
          planned().some((p) => p.slotKey?.startsWith("13 1|2026-11-23|")),
        ).toBe(false);
      });
      And("chapter order is kept", () => {
        const slots = slotOf();
        for (const g of GROUPS) {
          const order = new Map(
            expandLessons(world.items, world.overrides, g, "core").map(
              (l, i) => [l.id, i],
            ),
          );
          const read = planned()
            .filter((p) => p.groupId === g && !p.lessonId.startsWith("flex:"))
            .flatMap((p) => {
              const slot = slots.get(p.slotKey ?? "");
              return slot ? [{ slot, at: order.get(p.lessonId) ?? -1 }] : [];
            })
            .sort((a, b) => bySlotOrder(a.slot, b.slot))
            .map((x) => x.at);
          expect(read.length).toBe(order.size);
          expect(read).toEqual([...read].sort((a, b) => a - b));
        }
      });
      And("each chapter shows its spec reference", () => {
        const chapters = world.items.filter((i) => i.kind === "teaching");
        const points = new Set(pack.specPoints.map((p) => p.id));
        const packChapters = new Map(pack.chapters.map((c) => [c.id, c]));
        // Every chapter of her sheet follows its pack reference to spec points that exist in the locked pack.
        expect(chapters.length).toBeGreaterThan(0);
        for (const item of chapters) {
          expect(
            item.packRefs,
            `${item.id} is linked to no pack chapter`,
          ).not.toEqual([]);
          for (const ref of item.packRefs) {
            const linked = packChapters.get(ref);
            expect(
              linked,
              `${item.id} names ${ref}, which the pack lacks`,
            ).toBeDefined();
            expect(linked?.specPointIds.length).toBeGreaterThan(0);
            for (const id of linked?.specPointIds ?? [])
              expect(
                points.has(id),
                `${ref} links to a spec point that is not in the pack`,
              ).toBe(true);
          }
        }
        // Every planned lesson is one of those chapters' lessons, and every chapter is in every group's plan.
        const lessons = new Map(chapters.map((i) => [i.id, i.lessons]));
        for (const p of planned()) {
          if (p.lessonId.startsWith("flex:")) continue;
          const [itemId = "", n = ""] = p.lessonId.split("#");
          expect(lessons.has(itemId), `${p.lessonId} has no chapter`).toBe(
            true,
          );
          const index = Number(n);
          expect(Number.isInteger(index) && index >= 1).toBe(true);
          expect(index).toBeLessThanOrEqual(lessons.get(itemId) ?? 0);
        }
        for (const g of GROUPS)
          expect(
            [
              ...new Set(
                planned()
                  .filter(
                    (p) => p.groupId === g && !p.lessonId.startsWith("flex:"),
                  )
                  .map((p) => p.lessonId.split("#")[0]),
              ),
            ].sort(),
          ).toEqual([...lessons.keys()].sort());
      });
      And("the teaching-lesson total matches my sheet", () => {
        const sheet = world.items
          .filter((i) => i.kind === "teaching")
          .reduce((n, i) => n + i.lessons, 0);
        // The sheet states 10 and its chapters add up to 13; the plan follows the chapters.
        expect(sheet).toBe(sheetTotal);
        expect(sheet).toBe(13);
        for (const g of GROUPS) {
          const teaching = plan.placements.filter(
            (p) =>
              p.groupId === g &&
              !p.lessonId.startsWith("flex:") &&
              (p.state === "planned" || p.state === "declared"),
          );
          expect(teaching).toHaveLength(sheet);
        }
        expect(plan.overflow).toEqual([]);
      });
      And("spare lessons appear as flex lessons before each assessment", () => {
        const slots = slotOf();
        const assessed = plan.checkpoints.filter(
          (c) => c.kind === "assessment",
        );
        expect(assessed.map((c) => c.itemId)).toEqual(["a-ch2", "a-ch3"]);
        for (const cp of assessed) {
          const directlyBefore = GROUPS.filter((g) => {
            const anchor = plan.assessments.find(
              (a) => a.groupId === g && a.itemId === cp.itemId,
            );
            const anchorSlot = slots.get(anchor?.slotKey ?? "");
            if (!anchorSlot) return false;
            const before = world.slots
              .filter(
                (s) =>
                  s.groupId === g &&
                  s.status === "open" &&
                  bySlotOrder(s, anchorSlot) < 0,
              )
              .sort(bySlotOrder)
              .at(-1);
            const there = plan.placements.find(
              (p) => p.slotKey === before?.key,
            );
            return there?.lessonId.startsWith(`flex:${g}:${cp.id}#`) ?? false;
          });
          // Which groups have spare lessons depends on the year; every group that has one has it right before the assessment.
          const withSpare = GROUPS.filter((g) =>
            plan.placements.some(
              (p) =>
                p.slotKey !== null &&
                p.lessonId.startsWith(`flex:${g}:${cp.id}#`),
            ),
          );
          expect(withSpare.length).toBeGreaterThan(0);
          expect(directlyBefore).toEqual(withSpare);
        }
      });
    },
  );
});
