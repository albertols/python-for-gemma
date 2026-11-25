import {
  type CurriculumPack,
  packIssues,
  unmappedSpecPoints,
} from "@planner/domain";
import { sha256Hex } from "../sha256.ts";

/** JSON with object keys sorted at every level, so key order never matters. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** SHA-256 of the canonical JSON without lockedAt and hash. */
export function packHash(pack: CurriculumPack): Promise<string> {
  const { lockedAt: _lockedAt, hash: _hash, ...content } = pack;
  return sha256Hex(canonicalJson(content));
}

/** Seals a pack. Refuses one with broken references or unmapped in-scope points. */
export async function lockPack(
  pack: CurriculumPack,
  now: Date,
): Promise<CurriculumPack> {
  const issues = packIssues(pack);
  if (issues.length > 0)
    throw new Error(`Cannot lock the pack: ${issues.join(" ")}`);
  const unmapped = unmappedSpecPoints(pack);
  if (unmapped.length > 0)
    throw new Error(
      `Cannot lock the pack: ${unmapped.length} unmapped spec point(s): ${unmapped
        .map((p) => p.id)
        .join(", ")}.`,
    );
  return { ...pack, lockedAt: now.toISOString(), hash: await packHash(pack) };
}

/** True only when the pack is locked and its content still matches its hash. */
export async function isLockedAndIntact(
  pack: CurriculumPack,
): Promise<boolean> {
  if (pack.lockedAt === null || pack.hash === null) return false;
  return pack.hash === (await packHash(pack));
}
