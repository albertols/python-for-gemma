import {
  type CurriculumPack,
  packIssues,
  unmappedSpecPoints,
} from "@planner/domain";

const points = (n: number) => (n === 1 ? "1 point is" : `${n} points are`);

/**
 * Why the pack cannot be locked yet, one sentence each; empty when it can. The same rules the
 * API enforces on lock (broken references, in-scope points no chapter links to), plus her review:
 * every in-scope unit marked as checked.
 */
export function lockBlockers(
  pack: CurriculumPack,
  checkedUnitIds: ReadonlySet<string>,
): string[] {
  const reasons = [...packIssues(pack)];
  const unmapped = unmappedSpecPoints(pack);
  if (unmapped.length > 0)
    reasons.push(
      `${points(unmapped.length)} not linked to a chapter: ${unmapped.map((p) => p.code).join(", ")}.`,
    );
  const unchecked = pack.units.filter(
    (u) => u.inScope && !checkedUnitIds.has(u.id),
  ).length;
  if (unchecked > 0)
    reasons.push(
      `${unchecked === 1 ? "1 unit is" : `${unchecked} units are`} not marked as checked.`,
    );
  return reasons;
}

const mapChapter = (
  pack: CurriculumPack,
  chapterId: string,
  change: (ids: string[]) => string[],
): CurriculumPack => ({
  ...pack,
  chapters: pack.chapters.map((c) =>
    c.id === chapterId ? { ...c, specPointIds: change(c.specPointIds) } : c,
  ),
});

export const withLink = (
  pack: CurriculumPack,
  chapterId: string,
  specPointId: string,
): CurriculumPack =>
  mapChapter(pack, chapterId, (ids) =>
    ids.includes(specPointId) ? ids : [...ids, specPointId],
  );

export const withoutLink = (
  pack: CurriculumPack,
  chapterId: string,
  specPointId: string,
): CurriculumPack =>
  mapChapter(pack, chapterId, (ids) => ids.filter((id) => id !== specPointId));

export const withUnitScope = (
  pack: CurriculumPack,
  unitId: string,
  inScope: boolean,
): CurriculumPack => ({
  ...pack,
  units: pack.units.map((u) => (u.id === unitId ? { ...u, inScope } : u)),
});

/** A corrected title is trimmed; an empty one is refused and the pack comes back unchanged. */
export function withUnitTitle(
  pack: CurriculumPack,
  unitId: string,
  title: string,
): CurriculumPack {
  const t = title.trim();
  if (t === "") return pack;
  return {
    ...pack,
    units: pack.units.map((u) => (u.id === unitId ? { ...u, title: t } : u)),
  };
}

export function withPointTitle(
  pack: CurriculumPack,
  specPointId: string,
  title: string,
): CurriculumPack {
  const t = title.trim();
  if (t === "") return pack;
  return {
    ...pack,
    specPoints: pack.specPoints.map((p) =>
      p.id === specPointId ? { ...p, title: t } : p,
    ),
  };
}
