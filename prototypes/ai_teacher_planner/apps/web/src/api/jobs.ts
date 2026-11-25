import type { Provenance } from "@planner/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useEffect, useState } from "react";
import { api, call } from "./client.ts";
import type { PlannerConfig } from "./queries.ts";

export type AiRunView = InferResponseType<
  typeof api.api.ai.runs.$get,
  200
>[number];
export type AiItemView = InferResponseType<
  typeof api.api.ai.items.$get,
  200
>[number];

/** What the planner says while a job runs: plain words only, never prompt text. */
export type PublicProgress =
  | { kind: "started" | "done" }
  | { kind: "working"; note: string }
  | { kind: "failed"; reason: string };
export type JobEvent =
  | { type: "progress"; progress: PublicProgress }
  | { type: "run"; run: AiRunView };

export interface JobView {
  run: AiRunView | null;
  /** The latest progress note, while the job is working. */
  note: string | null;
  failed: string | null;
  ended: boolean;
}
export const initialJob: JobView = {
  run: null,
  note: null,
  failed: null,
  ended: false,
};

export function reduceJob(state: JobView, e: JobEvent): JobView {
  if (e.type === "run")
    return { ...state, run: e.run, note: null, ended: true };
  const p = e.progress;
  if (p.kind === "working") return { ...state, note: p.note };
  if (p.kind === "failed") return { ...state, note: null, failed: p.reason };
  if (p.kind === "done") return { ...state, note: null };
  return state;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/** One server-sent event as the page gets it. Anything that is not what the planner sends is dropped. */
export function parseEvent(name: string, data: string): JobEvent | null {
  let v: unknown;
  try {
    v = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isObject(v)) return null;
  if (name === "run")
    return typeof v.id === "string" && typeof v.status === "string"
      ? { type: "run", run: v as unknown as AiRunView }
      : null;
  if (name !== "progress") return null;
  if (v.kind === "started" || v.kind === "done")
    return { type: "progress", progress: { kind: v.kind } };
  if (v.kind === "working" && typeof v.note === "string")
    return { type: "progress", progress: { kind: "working", note: v.note } };
  if (v.kind === "failed" && typeof v.reason === "string")
    return { type: "progress", progress: { kind: "failed", reason: v.reason } };
  return null;
}

/** The job that is running now, else the one waiting longest. Runs come newest first. */
export function liveRun(runs: readonly AiRunView[]): AiRunView | null {
  const running = runs.find((r) => r.status === "running");
  if (running) return running;
  const queued = runs
    .filter((r) => r.status === "queued")
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return queued[0] ?? null;
}

export type ChipView =
  | { kind: "idle" }
  | { kind: "off" | "unavailable"; text: string }
  | { kind: "working"; text: string; runId: string };

/** What the header chip says: a running job, or why the AI cannot run, or nothing. */
export function chipView(
  ai: PlannerConfig["ai"],
  live: AiRunView | null,
  note: string | null,
): ChipView {
  if (live)
    return {
      kind: "working",
      runId: live.id,
      text:
        live.status === "queued"
          ? "AI is waiting its turn"
          : note
            ? `AI is working: ${note}`
            : "AI is working",
    };
  if (ai.mode === "off") return { kind: "off", text: "AI is switched off" };
  if (!ai.available)
    return {
      kind: "unavailable",
      text: ai.reason ? `AI unavailable: ${ai.reason}` : "AI unavailable",
    };
  return { kind: "idle" };
}

/** The suggested count of a lesson-count item, or null when the data is not of that shape. */
export function countOf(item: AiItemView): number | null {
  const d = item.data;
  if (
    item.kind === "lesson-count" &&
    isObject(d) &&
    typeof d.to === "number" &&
    Number.isInteger(d.to) &&
    d.to >= 1
  )
    return d.to;
  return null;
}

/** An item in her words. Kinds that have no screen yet fall back to what they are for. */
export function describeItem(item: AiItemView): {
  title: string;
  detail: string | null;
} {
  const d = item.data;
  if (item.kind === "lesson-count" && isObject(d) && typeof d.to === "number") {
    const name = typeof d.title === "string" ? d.title : item.target;
    const change =
      typeof d.from === "number" ? `${d.from} to ${d.to}` : `${d.to}`;
    return {
      title: `${name}: ${change} lessons`,
      detail: typeof d.reason === "string" ? d.reason : null,
    };
  }
  return { title: `${item.kind} for ${item.target}`, detail: null };
}

/** The same shape the planner stores with every AI item, for the popover. */
export function provenanceOf(run: AiRunView, item: AiItemView): Provenance {
  return {
    origin: "ai",
    ai: {
      runId: run.id,
      provider: run.provider ?? "unknown",
      model: run.model ?? "unknown",
      skillId: run.skillId,
      at: run.startedAt,
      sources: item.sources,
      review: item.review,
    },
  };
}

export function useAiRuns() {
  return useQuery({
    queryKey: ["ai", "runs"],
    queryFn: () => call<AiRunView[]>(() => api.api.ai.runs.$get()),
    // while a job is live, look again now and then; the progress itself comes from the stream
    refetchInterval: (q) => (liveRun(q.state.data ?? []) ? 2000 : false),
  });
}

export function useAiItems() {
  return useQuery({
    queryKey: ["ai", "items"],
    queryFn: () =>
      call<AiItemView[]>(() => api.api.ai.items.$get({ query: {} })),
  });
}

/** Follows one job's event stream. Everything so far is replayed when it connects. */
export function useJob(jobId: string | null): JobView {
  const [state, setState] = useState<JobView>(initialJob);
  const qc = useQueryClient();
  useEffect(() => {
    setState(initialJob);
    if (!jobId) return;
    const stream = new EventSource(
      `/api/ai/jobs/${encodeURIComponent(jobId)}/events`,
    );
    const listen = (name: "progress" | "run") => (m: MessageEvent<string>) => {
      const e = parseEvent(name, m.data);
      if (!e) return;
      setState((s) => reduceJob(s, e));
      if (e.type === "run") {
        stream.close();
        void qc.invalidateQueries({ queryKey: ["ai"] });
      }
    };
    stream.addEventListener("progress", listen("progress"));
    stream.addEventListener("run", listen("run"));
    return () => stream.close();
  }, [jobId, qc]);
  return state;
}

export function useCancelJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      call<AiRunView>(() =>
        api.api.ai.jobs[":id"].cancel.$post({ param: { id } }),
      ),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["ai"] }),
  });
}

export function useReviewItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      state,
      data,
    }: {
      id: string;
      state: "accepted" | "edited" | "rejected";
      data?: unknown;
    }) =>
      call<AiItemView>(() =>
        api.api.ai.items[":id"].review.$post({
          param: { id },
          json: { state, ...(data === undefined ? {} : { data }) },
        }),
      ),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["ai"] }),
  });
}
