import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { featureFile } from "@planner/fixtures";
import { afterAll, expect } from "vitest";
import { createResourceGateway, ResourceDenied } from "./resource-gateway.ts";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "allowlist-"));
const studentFile = "ibdp/IA/IA 2026/student1/draft.docx";
fs.mkdirSync(path.dirname(path.join(root, studentFile)), { recursive: true });
fs.writeFileSync(path.join(root, studentFile), "invented");
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const feature = await loadFeature(featureFile("14-allowlist"));
describeFeature(feature, ({ Scenario }) => {
  Scenario("The allowlist holds", ({ Given, When, Then }) => {
    let asked = "";
    let outcome: unknown;
    Given("a path inside a student-work folder", () => {
      asked = studentFile;
    });
    When("anything asks the gateway for it", async () => {
      outcome = await createResourceGateway(root)
        .read(asked)
        .catch((e: unknown) => e);
    });
    Then("it is refused", () => {
      expect(outcome).toBeInstanceOf(ResourceDenied);
    });
  });
});
