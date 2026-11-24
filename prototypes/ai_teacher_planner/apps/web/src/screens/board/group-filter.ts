/** The groups named in the address (`?groups=13 1,13 3`), or null for all of them. Unknown ids are ignored. */
export function parseGroups(
  raw: string | null,
  known: readonly string[],
): ReadonlySet<string> | null {
  if (!raw) return null;
  const chosen = new Set(raw.split(",").filter((id) => known.includes(id)));
  return chosen.size > 0 ? chosen : null;
}

/** Turn one group on or off. Switching the last one off means all groups. */
export function toggleGroup(
  current: ReadonlySet<string> | null,
  id: string,
): ReadonlySet<string> | null {
  const next = new Set(current ?? []);
  if (!next.delete(id)) next.add(id);
  return next.size > 0 ? next : null;
}

/** The address value, in the order of the groups; null removes the parameter. */
export function groupsParam(
  chosen: ReadonlySet<string> | null,
  known: readonly string[],
): string | null {
  if (!chosen) return null;
  const ids = known.filter((id) => chosen.has(id));
  return ids.length > 0 ? ids.join(",") : null;
}
