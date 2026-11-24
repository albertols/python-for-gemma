import { expect, test } from "vitest";
import { domainSourceFiles, importSpecifiers, read } from "./domain-source.ts";

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
