import type { CourseId } from "./timetable.ts";

export interface PackUnit {
  id: string;
  code: string;
  title: string;
  inScope: boolean;
}

export interface SpecPoint {
  id: string;
  unitId: string;
  code: string;
  title: string;
  level: "core" | "hl-only";
  page: number | null;
}

export interface PackChapter {
  id: string;
  unitId: string;
  number: string;
  title: string;
  specPointIds: string[];
  hlOnly: boolean;
  page: number | null;
}

export interface CurriculumPack {
  schemaVersion: 1;
  courseId: CourseId;
  board: string;
  subject: string;
  version: string;
  units: PackUnit[];
  specPoints: SpecPoint[];
  chapters: PackChapter[];
  source: { fileName: string; pages: number };
  lockedAt: string | null;
  hash: string | null;
}

/** In-scope spec points that no chapter links to. */
export function unmappedSpecPoints(pack: CurriculumPack): SpecPoint[] {
  const inScope = new Set(pack.units.filter((u) => u.inScope).map((u) => u.id));
  const linked = new Set(pack.chapters.flatMap((c) => c.specPointIds));
  return pack.specPoints.filter(
    (p) => inScope.has(p.unitId) && !linked.has(p.id),
  );
}

/** Broken references and duplicate ids, one sentence each. */
export function packIssues(pack: CurriculumPack): string[] {
  const issues: string[] = [];
  const unitIds = new Set(pack.units.map((u) => u.id));
  const pointIds = new Set(pack.specPoints.map((p) => p.id));
  const duplicates = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) issues.push(`Duplicate ${kind} id ${id}.`);
      seen.add(id);
    }
  };
  duplicates(
    "unit",
    pack.units.map((u) => u.id),
  );
  duplicates(
    "spec point",
    pack.specPoints.map((p) => p.id),
  );
  duplicates(
    "chapter",
    pack.chapters.map((c) => c.id),
  );
  for (const p of pack.specPoints) {
    if (!unitIds.has(p.unitId))
      issues.push(
        `Spec point ${p.id} is in unit ${p.unitId}, which does not exist.`,
      );
  }
  for (const c of pack.chapters) {
    if (!unitIds.has(c.unitId))
      issues.push(
        `Chapter ${c.id} is in unit ${c.unitId}, which does not exist.`,
      );
    for (const id of c.specPointIds) {
      if (!pointIds.has(id))
        issues.push(
          `Chapter ${c.id} links to spec point ${id}, which does not exist.`,
        );
    }
  }
  return issues;
}

/**
 * The spec points behind chapter ids (a scheme item's packRefs are chapter
 * ids), in the order the chapters link them, without duplicates. An unknown
 * ref gives nothing: packIssues is where broken references are reported.
 */
export function specPointsFor(
  pack: CurriculumPack,
  packRefs: readonly string[],
): SpecPoint[] {
  const byId = new Map(pack.specPoints.map((p) => [p.id, p]));
  const chapters = new Map(pack.chapters.map((c) => [c.id, c]));
  const found = new Map<string, SpecPoint>();
  for (const ref of packRefs) {
    for (const id of chapters.get(ref)?.specPointIds ?? []) {
      const point = byId.get(id);
      if (point) found.set(id, point);
    }
  }
  return [...found.values()];
}
