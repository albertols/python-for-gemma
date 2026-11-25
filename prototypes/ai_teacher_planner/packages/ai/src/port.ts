import type { Source } from "@planner/domain";
import type { z } from "zod";

export type SkillId =
  | "planner-import-timetable"
  | "planner-build-curriculum-pack"
  | "planner-classify-calendar-events"
  | "planner-suggest-lesson-counts"
  | "planner-hl-prerequisites"
  | "content-refresh-resource"
  | "content-cover-lesson"
  | "content-independent-task";

export interface AiTask<T> {
  skillId: SkillId;
  input: unknown;
  text: string | null;
  attachments: { path: string; mediaType: string }[];
  schema: z.ZodType<T>;
  tools: ("WebSearch" | "WebFetch")[];
}

export interface AiMeta {
  provider: string;
  model: string;
  skillId: SkillId;
  startedAt: string;
  durationMs: number;
  sources: Source[];
}

export interface AiResult<T> {
  data: T;
  meta: AiMeta;
}

export type AiProgress =
  | { kind: "started" }
  | { kind: "working"; note: string }
  | { kind: "done" }
  | { kind: "failed"; reason: string };

export interface AiProvider {
  id: string;
  available(): Promise<{ ok: true } | { ok: false; reason: string }>;
  run<T>(
    task: AiTask<T>,
    opts: { signal: AbortSignal; onProgress: (p: AiProgress) => void },
  ): Promise<AiResult<T>>;
}

export type AiErrorReason =
  | "unavailable"
  | "signed-out"
  | "timeout"
  | "invalid-output"
  | "cancelled"
  | "failed";

export class AiError extends Error {
  reason: AiErrorReason;
  constructor(reason: AiErrorReason, message?: string) {
    super(message ?? reason);
    this.name = "AiError";
    this.reason = reason;
  }
}
