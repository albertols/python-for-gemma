/** Who made a stored item: the engine, the AI, the teacher, or an import. */
export type Origin = "engine" | "ai" | "teacher" | "import";

/** Where an AI item stands with her. Only "accepted" and "edited" can leave the app. */
export type ReviewState = "suggested" | "accepted" | "edited" | "rejected";

/** A page the AI read or was pointed to. `opened` says whether it was actually read. */
export interface Source {
  url: string;
  title: string | null;
  opened: boolean;
}

/** Every stored scheme item and plan item says who made it, and for AI items, how. */
export interface Provenance {
  origin: Origin;
  ai: {
    runId: string;
    provider: string;
    model: string;
    skillId: string;
    at: string;
    sources: Source[];
    review: ReviewState;
  } | null;
}

export const ENGINE: Provenance = { origin: "engine", ai: null };
export const TEACHER: Provenance = { origin: "teacher", ai: null };
export const IMPORTED: Provenance = { origin: "import", ai: null };

/** An AI item is exportable only once she accepted it, with or without edits. Everything else is. */
function isExportable(p: Provenance): boolean {
  if (p.origin !== "ai") return true;
  return (
    p.ai !== null && (p.ai.review === "accepted" || p.ai.review === "edited")
  );
}

/** Splits items into those that may be exported and those held back, each in the order given. */
export function exportable<T extends { provenance: Provenance }>(
  items: readonly T[],
): { included: T[]; excluded: T[] } {
  const included: T[] = [];
  const excluded: T[] = [];
  for (const item of items)
    (isExportable(item.provenance) ? included : excluded).push(item);
  return { included, excluded };
}
