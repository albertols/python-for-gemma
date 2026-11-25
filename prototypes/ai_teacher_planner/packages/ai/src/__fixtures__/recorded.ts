import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
/** The recorded run, one string per line (5 lines: init, assistant, user, rate limit, result). */
export const recordedLines = readFileSync(
  join(here, "claude-stream-ok.ndjson"),
  "utf8",
)
  .split("\n")
  .filter((l) => l.trim() !== "");

/** The recording with the last (result) line changed. */
export function withResult(change: (r: Record<string, unknown>) => void) {
  const lines = [...recordedLines];
  const result = JSON.parse(lines.at(-1) ?? "{}") as Record<string, unknown>;
  change(result);
  lines[lines.length - 1] = JSON.stringify(result);
  return lines;
}
