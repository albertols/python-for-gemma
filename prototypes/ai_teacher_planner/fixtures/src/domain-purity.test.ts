import { relative } from "node:path";
import { expect, test } from "vitest";
import {
  domainSourceFiles,
  importSpecifiers,
  read,
  workspaceRoot,
  workspaceSourceFiles,
} from "./domain-source.ts";

test("the engine imports nothing but itself", () => {
  for (const file of domainSourceFiles())
    for (const spec of importSpecifiers(read(file)))
      expect(spec.startsWith("./"), `${file} imports ${spec}`).toBe(true);
});

test("the engine has no clock and no randomness", () => {
  for (const file of domainSourceFiles())
    expect(read(file), file).not.toMatch(
      /Date\.now\(|new Date\(\s*\)|Math\.random\(/,
    );
});

test("the purity check sees at least one file", () =>
  expect(domainSourceFiles().length).toBeGreaterThan(0));

test("only the gateway and the config read the resources folder", () => {
  const allowed = (rel: string) =>
    rel === "apps/api/src/config.ts" ||
    rel === "apps/api/src/main.ts" ||
    rel.startsWith("apps/api/src/gateway/") ||
    rel === "packages/importers/src/resources-available.ts";
  const mentioning = workspaceSourceFiles()
    .filter((f) => /resourcesDir|PLANNER_RESOURCES_DIR/.test(read(f)))
    .map((f) => relative(workspaceRoot, f).split("\\").join("/"));
  expect(mentioning.filter((rel) => !allowed(rel))).toEqual([]);
  expect(mentioning).toContain("apps/api/src/config.ts");
});

test("nothing else reaches the resources folder through its helper", () => {
  const allowed = (rel: string) =>
    rel === "packages/importers/src/resources-available.ts";
  const mentioning = workspaceSourceFiles()
    .filter((f) =>
      /calendarWorkbookPath|resourcesAvailable|resources-available/.test(
        read(f),
      ),
    )
    .map((f) => relative(workspaceRoot, f).split("\\").join("/"));
  expect(mentioning.filter((rel) => !allowed(rel))).toEqual([]);
});
