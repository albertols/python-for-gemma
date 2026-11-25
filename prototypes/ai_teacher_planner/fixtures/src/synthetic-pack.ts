import type { CurriculumPack } from "@planner/domain";

/**
 * An INVENTED curriculum pack. Nothing here comes from an exam board's
 * specification: the names, codes and page numbers are made up for tests.
 * u2 is out of scope, so its two spec points need no chapter.
 */
export function syntheticPack(): CurriculumPack {
  const point = (
    n: number,
    unitId: string,
    level: "core" | "hl-only" = "core",
  ) => ({
    id: `sp${n}`,
    unitId,
    code: `${unitId === "u1" ? "1" : "2"}.${n}`,
    title: `Invented point ${n}`,
    level,
    page: 10 + n,
  });
  const chapter = (n: number, specPointIds: string[], hlOnly = false) => ({
    id: `ch${n}`,
    unitId: "u1",
    number: String(n),
    title: `Invented chapter ${n}`,
    specPointIds,
    hlOnly,
    page: 100 + n * 10,
  });
  return {
    schemaVersion: 1,
    courseId: "syn-econ",
    board: "Invented Board",
    subject: "Invented Economics",
    version: "2026.1",
    units: [
      { id: "u1", code: "U1", title: "Markets", inScope: true },
      { id: "u2", code: "U2", title: "Firms", inScope: false },
    ],
    specPoints: [
      point(1, "u1"),
      point(2, "u1"),
      point(3, "u1"),
      point(4, "u1"),
      point(5, "u1"),
      point(6, "u1", "hl-only"),
      point(7, "u2"),
      point(8, "u2"),
    ],
    chapters: [
      chapter(1, ["sp1", "sp2"]),
      chapter(2, ["sp3"]),
      chapter(3, ["sp3"]),
      chapter(4, ["sp4"]),
      chapter(5, ["sp5"]),
      chapter(6, ["sp6"], true),
    ],
    source: { fileName: "invented-spec.pdf", pages: 60 },
    lockedAt: null,
    hash: null,
  };
}
