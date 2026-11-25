import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import {
  featureFile,
  paceWorld,
  SEED_TERMS,
  syntheticRows,
} from "@planner/fixtures";
import { expect } from "vitest";
import { toCalendarDays } from "./calendar.ts";
import { expandLessons } from "./lessons.ts";
import type { PlanInputs, PlanSnapshot } from "./plan.ts";
import { sequence } from "./sequence.ts";
import { bySlotOrder } from "./slots.ts";

// The domain-only version (pre-flight ruling 21): paceWorld stands in for her
// documents. Its scheme gets pack references to a small synthetic pack, so the
// spec-reference step has something to follow. Task 2.13 writes the full-year
// version in apps/api with the imported sheet and pack.
const SPEC_POINTS = new Set(["4.3.1", "4.3.2", "4.3.3", "4.3.4"]);
const CHAPTERS: Record<string, string[]> = {
  "ch-1": ["4.3.1"],
  "ch-2": ["4.3.2"],
  "ch-3": ["4.3.3", "4.3.4"],
  "ch-4": ["4.3.4"],
};
const GROUPS = ["13 1", "13 3", "13 5"];

const feature = await loadFeature(featureFile("05-schedule-from-documents"));
describeFeature(feature, ({ Scenario }) => {
  Scenario(
    "Story 1: a schedule from my documents",
    ({ Given, When, Then, And }) => {
      let world: PlanInputs;
      let plan: PlanSnapshot;
      const days = toCalendarDays(syntheticRows(), SEED_TERMS);
      const slotOf = () => new Map(world.slots.map((s) => [s.key, s]));
      const planned = () =>
        plan.placements.filter(
          (p) => p.slotKey !== null && p.state === "planned",
        );

      Given(
        "the calendar, my timetable and the IAL Unit 4 scheme with my class counts",
        () => {
          world = paceWorld();
          const refs: Record<string, string> = {
            c1: "ch-1",
            c2: "ch-2",
            c3: "ch-3",
            c4: "ch-4",
          };
          world.items = world.items.map((i) =>
            refs[i.id] ? { ...i, packRefs: [refs[i.id] ?? ""] } : i,
          );
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
        const items = new Map(world.items.map((i) => [i.id, i]));
        const taught = new Set(
          planned()
            .filter((p) => !p.lessonId.startsWith("flex:"))
            .map((p) => p.lessonId.split("#")[0] ?? ""),
        );
        expect([...taught].sort()).toEqual(["c1", "c2", "c3", "c4"]);
        for (const id of taught) {
          const refs = items.get(id)?.packRefs ?? [];
          const points = refs.flatMap((r) => CHAPTERS[r] ?? []);
          expect(points.length).toBeGreaterThan(0);
          for (const sp of points) expect(SPEC_POINTS.has(sp)).toBe(true);
        }
      });
      And("the teaching-lesson total matches my sheet", () => {
        const sheet = world.items
          .filter((i) => i.kind === "teaching")
          .reduce((n, i) => n + i.lessons, 0);
        expect(sheet).toBe(12);
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
        expect(assessed.length).toBeGreaterThan(0);
        for (const cp of assessed) {
          // At least one group has a spare lesson in its last open slot before it sits the assessment.
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
            return there?.lessonId === `flex:${g}:${cp.id}#1`;
          });
          expect(directlyBefore).toEqual(["13 3"]);
        }
      });
    },
  );
});
