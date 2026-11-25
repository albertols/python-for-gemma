import { syntheticPack } from "@planner/fixtures";
import { describe, expect, test } from "vitest";
import { packIssues, specPointsFor, unmappedSpecPoints } from "./pack.ts";

describe("pack checks", () => {
  test("the synthetic pack has no issues and nothing unmapped", () => {
    const pack = syntheticPack();
    expect(packIssues(pack)).toEqual([]);
    expect(unmappedSpecPoints(pack)).toEqual([]);
  });

  test("a spec point no chapter links to is unmapped; an out-of-scope one is not", () => {
    const pack = syntheticPack();
    // sp5 is in scope and only ch5 links it; sp7 and sp8 sit in out-of-scope u2 and are linked by no one.
    const chapters = pack.chapters.map((c) =>
      c.id === "ch5" ? { ...c, specPointIds: [] } : c,
    );
    const unmapped = unmappedSpecPoints({ ...pack, chapters });
    expect(unmapped.map((p) => p.id)).toEqual(["sp5"]);
  });

  test("a chapter that links to a missing spec point is an issue", () => {
    const pack = syntheticPack();
    const chapters = pack.chapters.map((c) =>
      c.id === "ch2" ? { ...c, specPointIds: ["sp3", "nope"] } : c,
    );
    const issues = packIssues({ ...pack, chapters });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("ch2");
    expect(issues[0]).toContain("nope");
  });

  test("a chapter in a missing unit, a point in a missing unit and duplicate ids are issues", () => {
    const pack = syntheticPack();
    const [first, ...rest] = pack.chapters;
    if (!first) throw new Error("fixture has chapters");
    const issues = packIssues({
      ...pack,
      chapters: [{ ...first, unitId: "u9" }, ...rest, { ...first, id: "ch1" }],
      specPoints: pack.specPoints.map((p) =>
        p.id === "sp8" ? { ...p, unitId: "u9" } : p,
      ),
    });
    expect(issues.some((i) => i.includes("ch1") && i.includes("u9"))).toBe(
      true,
    );
    expect(issues.some((i) => i.includes("sp8") && i.includes("u9"))).toBe(
      true,
    );
    expect(issues.some((i) => /duplicate/i.test(i) && i.includes("ch1"))).toBe(
      true,
    );
  });

  test("specPointsFor follows chapter links and removes duplicates", () => {
    const pack = syntheticPack();
    // ch1 gives sp1, sp2; ch2 and ch3 both give sp3; an unknown ref gives nothing.
    const found = specPointsFor(pack, ["ch1", "ch2", "ch3", "ghost"]);
    expect(found.map((p) => p.id)).toEqual(["sp1", "sp2", "sp3"]);
    expect(specPointsFor(pack, [])).toEqual([]);
  });
});
