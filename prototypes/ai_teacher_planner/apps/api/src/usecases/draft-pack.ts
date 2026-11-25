import path from "node:path";
import type {
  AiMeta,
  AiProgress,
  AiProvider,
  BuildCurriculumPackInput,
  BuildCurriculumPackOutput,
} from "@planner/ai";
import { AiError, buildCurriculumPack } from "@planner/ai";
import {
  type CourseId,
  type CurriculumPack,
  type PackChapter,
  packIssues,
} from "@planner/domain";
import { curriculumPackSchema, extractPdfText } from "@planner/importers";
import { ApiError } from "../errors.ts";
import type { ResourceGateway } from "../gateway/resource-gateway.ts";

/** A specification is short. Anything longer is a textbook, which this step does not take. */
export const MAX_SPEC_PAGES = 150;

/** What the model said and Gemma should see beside the draft: why each link, and what it was unsure of. */
export interface PackDraftReview {
  linkReasons: { chapterNumber: string; specPointId: string; reason: string }[];
  unsure: { about: string; note: string }[];
}

export interface DraftPackArgs {
  courseId: CourseId;
  /** A path on the allowlist, relative to the resources folder. It never reaches the model. */
  specPath: string;
  chapters: { number: string; title: string }[];
  unitsInScope: string[];
  /** What the pack says about itself; the specification text does not give them to the skill. */
  board?: string;
  subject?: string;
  version?: string;
}

export interface DraftPackResult {
  pack: CurriculumPack;
  meta: AiMeta;
  /** Why the draft needs her eye: zod's and the pack rules' issues, one sentence each. Empty when clean. */
  issues: string[];
  review: PackDraftReview;
}

const noop = () => {};

/** Turns the model's answer into a pack (unlocked, no hash) and the notes kept beside it. */
function assemble(
  out: BuildCurriculumPackOutput,
  args: DraftPackArgs,
  source: { fileName: string; pages: number },
): { pack: CurriculumPack; review: PackDraftReview; notes: string[] } {
  const notes: string[] = [];
  const review: PackDraftReview = { linkReasons: [], unsure: out.unsure };
  const pointById = new Map(out.specPoints.map((p) => [p.id, p]));
  const firstInScope = out.units.find((u) => u.inScope)?.id ?? "";

  const byNumber = new Map<
    string,
    BuildCurriculumPackOutput["chapters"][number]
  >();
  for (const c of out.chapters) {
    if (!args.chapters.some((own) => own.number === c.number))
      notes.push(
        `The model returned a chapter "${c.number}" that is not in her list.`,
      );
    else if (!byNumber.has(c.number)) byNumber.set(c.number, c);
  }

  // Her chapter list decides which chapters exist; the model only links them.
  const chapters: PackChapter[] = args.chapters.map((own) => {
    const given = byNumber.get(own.number);
    if (!given) notes.push(`The model did not return chapter "${own.number}".`);
    const links = given?.links ?? [];
    for (const l of links)
      review.linkReasons.push({
        chapterNumber: own.number,
        specPointId: l.specPointId,
        reason: l.reason,
      });
    const linked = links.map((l) => pointById.get(l.specPointId));
    const unitId =
      given?.unitId ??
      linked.find((p) => p !== undefined)?.unitId ??
      firstInScope;
    return {
      id: `ch${own.number}`,
      unitId,
      number: own.number,
      title: own.title,
      specPointIds: links.map((l) => l.specPointId),
      // Higher level only when every point it covers is: the engine's rule, not the model's.
      hlOnly:
        linked.length > 0 &&
        linked.every((p) => p !== undefined && p.level === "hl-only"),
      page: null,
    };
  });

  return {
    pack: {
      schemaVersion: 1,
      courseId: args.courseId,
      board: args.board ?? "",
      subject: args.subject ?? "",
      version: args.version ?? "draft",
      units: out.units,
      specPoints: out.specPoints,
      chapters,
      source,
      lockedAt: null,
      hash: null,
    },
    review,
    notes,
  };
}

/** Checks the model cannot be trusted with: every page is a real page, every code is on its page. */
function textIssues(
  pack: CurriculumPack,
  pages: { number: number; text: string }[],
): string[] {
  const issues: string[] = [];
  const pageText = new Map(pages.map((p) => [p.number, p.text]));
  for (const p of pack.specPoints) {
    const text = p.page === null ? undefined : pageText.get(p.page);
    if (text === undefined)
      issues.push(
        `Spec point ${p.code} is on page ${p.page}, which is not a page of this specification.`,
      );
    else if (!text.includes(p.code))
      issues.push(
        `Spec point ${p.code} is not written on page ${p.page} of the specification.`,
      );
  }
  return issues;
}

/**
 * Drafts a curriculum pack from a specification PDF. The gateway reads the file, the
 * text goes to the model, and nothing is written here: the caller saves the draft for her
 * review. A draft with problems gets ONE repair attempt (the problems go back to the
 * model); if it still has problems, it comes back with them, never loosened or patched.
 */
export async function draftPack(
  deps: {
    gateway: ResourceGateway;
    ai: AiProvider;
    signal?: AbortSignal;
    onProgress?: (p: AiProgress) => void;
  },
  args: DraftPackArgs,
): Promise<DraftPackResult> {
  const bytes = await deps.gateway.read(args.specPath);
  const pages = await extractPdfText(bytes).then(
    (r) => r.pages,
    (e: unknown) => {
      throw new ApiError(
        422,
        "spec-unreadable",
        e instanceof Error
          ? e.message
          : "This file could not be read as a PDF.",
      );
    },
  );
  if (pages.length > MAX_SPEC_PAGES)
    throw new ApiError(
      422,
      "spec-too-long",
      `This file has ${pages.length} pages. A specification is ${MAX_SPEC_PAGES} pages or fewer: this looks like a textbook.`,
    );
  if (pages.every((p) => p.text === ""))
    throw new ApiError(
      422,
      "spec-no-text",
      "This PDF has no text in it (it may be a scan), so there is nothing to read.",
    );

  const source = {
    fileName: path.basename(args.specPath),
    pages: pages.length,
  };
  const base: BuildCurriculumPackInput = {
    courseId: args.courseId,
    board: args.board ?? "",
    unitsInScope: args.unitsInScope,
    chapters: args.chapters,
    pages,
  };
  const ask = (input: BuildCurriculumPackInput) =>
    deps.ai.run(
      {
        skillId: buildCurriculumPack.id,
        input,
        text: null,
        attachments: [],
        schema: buildCurriculumPack.output,
        tools: buildCurriculumPack.tools,
      },
      {
        signal: deps.signal ?? new AbortController().signal,
        onProgress: deps.onProgress ?? noop,
      },
    );
  const check = (out: BuildCurriculumPackOutput) => {
    const built = assemble(out, args, source);
    const parsed = curriculumPackSchema.safeParse(built.pack);
    const schemaIssues = parsed.success
      ? []
      : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    const issues = [
      ...schemaIssues,
      ...packIssues(built.pack),
      ...textIssues(built.pack, pages),
      ...built.notes,
    ];
    return { ...built, issues };
  };

  const first = await ask(base);
  const draft = check(first.data);
  if (draft.issues.length === 0)
    return {
      pack: draft.pack,
      meta: first.meta,
      issues: [],
      review: draft.review,
    };

  try {
    const second = await ask({
      ...base,
      repair: { problems: draft.issues, previous: first.data },
    });
    const repaired = check(second.data);
    return {
      pack: repaired.pack,
      meta: second.meta,
      issues: repaired.issues,
      review: repaired.review,
    };
  } catch (e) {
    // Cancelling is her decision; only a failed repair keeps the first draft.
    if (!(e instanceof AiError) || e.reason === "cancelled") throw e;
    return {
      pack: draft.pack,
      meta: first.meta,
      issues: [
        ...draft.issues,
        "A second attempt to fix these problems did not work.",
      ],
      review: draft.review,
    };
  }
}
