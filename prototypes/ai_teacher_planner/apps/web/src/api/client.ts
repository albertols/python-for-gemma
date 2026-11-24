import type { AppType } from "@planner/api/app";
import { hc } from "hono/client";

export const api = hc<AppType>("/");

/** The browser could not reach the API at all (it is not running). */
export class PlannerNotRunning extends Error {
  constructor() {
    super("The planner is not running.");
    this.name = "PlannerNotRunning";
  }
}

/** The API answered with an error; the message is the API's own words. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** The API's list of reasons, when it gave one (a refused save). */
  readonly issues: string[];
  constructor(
    status: number,
    code: string,
    message: string,
    issues: string[] = [],
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

/** Runs a typed call and returns its JSON, or throws one of the two errors above. */
export async function call<T>(request: () => Promise<Response>): Promise<T> {
  let res: Response;
  try {
    res = await request();
  } catch {
    throw new PlannerNotRunning();
  }
  if (res.ok) return (await res.json()) as T;
  const body = (await res.json().catch(() => null)) as {
    error?: { code?: string; message?: string; issues?: string[] };
  } | null;
  throw new ApiError(
    res.status,
    body?.error?.code ?? "unknown",
    body?.error?.message ?? `The planner answered with status ${res.status}.`,
    body?.error?.issues ?? [],
  );
}
