import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { featureFile, paceWorld } from "@planner/fixtures";
import { expect } from "vitest";
import type { PlanSnapshot } from "./plan.ts";
import {
  acceptProposal,
  headSnapshot,
  type PlanChain,
  propose,
  undo,
} from "./revisions.ts";
import { sequence } from "./sequence.ts";

const feature = await loadFeature(featureFile("08-undo"));
describeFeature(feature, ({ Scenario }) => {
  Scenario("Undo", ({ Given, When, Then, And }) => {
    const world = paceWorld();
    let chain: PlanChain;
    let asBefore: PlanSnapshot | null;
    let reflowId = "";

    Given("I accepted a reflow", () => {
      const first = sequence(world);
      const start = acceptProposal(
        { planId: "ial-business-u4", headId: null, revisions: {} },
        propose({
          planId: "ial-business-u4",
          baseRevisionId: null,
          head: null,
          inputs: world,
          label: "First plan",
        }),
        { id: "r1", createdAt: "2026-11-09T09:00:00Z" },
      );
      if (!start.ok) throw new Error("refused");
      asBefore = headSnapshot(start.chain);
      expect(asBefore).toEqual(first);
      const closed = {
        ...world,
        slots: world.slots.map((s) =>
          s.key === "13 1|2026-11-18|2"
            ? { ...s, status: "cancelled" as const }
            : s,
        ),
      };
      const reflow = acceptProposal(
        start.chain,
        propose({
          planId: "ial-business-u4",
          baseRevisionId: "r1",
          head: asBefore,
          inputs: closed,
          label: "Closure on 18 Nov",
        }),
        { id: "r2", createdAt: "2026-11-10T09:00:00Z" },
      );
      if (!reflow.ok) throw new Error("refused");
      chain = reflow.chain;
      reflowId = "r2";
      expect(headSnapshot(chain)).not.toEqual(asBefore);
    });
    When("I undo it", () => {
      const out = undo(chain);
      if (!out.ok) throw new Error("nothing to undo");
      chain = out.chain;
    });
    Then("the plan is exactly as before", () => {
      expect(headSnapshot(chain)).toEqual(asBefore);
    });
    And(
      "the reflow is still in the history so I can see what was undone",
      () => {
        expect(chain.revisions[reflowId]?.label).toBe("Closure on 18 Nov");
        expect(chain.headId).toBe("r1");
      },
    );
  });
});
