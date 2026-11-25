import { AiError, type AiProgress } from "./port.ts";

type Json = Record<string, unknown>;

/** Every error text she can see is cut to this many characters. */
export const MAX_ERROR_TEXT = 300;
export const cutForUser = (text: string): string =>
  text.slice(0, MAX_ERROR_TEXT);

const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Plain words for the tool a model is calling. The model's own text is never shown. */
function noteForTool(name: unknown): string {
  if (name === "StructuredOutput") return "Writing the answer";
  if (name === "WebSearch") return "Searching the web";
  if (name === "WebFetch") return "Reading a web page";
  return "Working";
}

function notesForAssistant(event: Json): string[] {
  const message = event.message;
  const content = isObject(message) ? message.content : undefined;
  if (!Array.isArray(content)) return [];
  const notes: string[] = [];
  for (const block of content) {
    if (!isObject(block)) continue;
    if (block.type === "tool_use") notes.push(noteForTool(block.name));
    else if (block.type === "text") notes.push("Working");
  }
  return notes;
}

/**
 * Reads Claude Code's `--output-format stream-json` lines (as recorded in
 * __fixtures__/claude-stream-ok.ndjson): `system` (subtype `init`, carries the model),
 * `assistant`, `user`, `rate_limit_event`, then one `result`. Lines that are blank or not
 * JSON are skipped. Only the first `result` decides the outcome, and the stream is read to
 * its end first, so the child's pipe is never closed on it mid-write.
 */
export async function parseStream(
  lines: AsyncIterable<string>,
  onProgress: (p: AiProgress) => void,
): Promise<{ output: unknown; model: string }> {
  let model: string | null = null;
  let final:
    | { error: AiError }
    | { value: { output: unknown; model: string } }
    | null = null;
  for await (const line of lines) {
    if (line.trim() === "") continue;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isObject(event)) continue;

    if (event.type === "system" && event.subtype === "init") {
      if (typeof event.model === "string") model = event.model;
      onProgress({ kind: "working", note: "Connected to Claude" });
    } else if (event.type === "assistant") {
      for (const note of notesForAssistant(event))
        onProgress({ kind: "working", note });
    } else if (event.type === "result" && final === null) {
      if (event.is_error === true || event.subtype !== "success") {
        const said = typeof event.result === "string" ? event.result : "";
        final = {
          error: new AiError(
            "failed",
            cutForUser(
              said !== ""
                ? `Claude could not finish: ${said}`
                : `Claude could not finish (${String(event.subtype)})`,
            ),
          ),
        };
      } else if (
        !("structured_output" in event) ||
        event.structured_output == null
      ) {
        final = {
          error: new AiError(
            "invalid-output",
            "Claude finished but gave no structured answer",
          ),
        };
      } else {
        final = {
          value: {
            output: event.structured_output,
            model: model ?? modelFromUsage(event.modelUsage),
          },
        };
      }
    }
  }
  if (final !== null) {
    if ("error" in final) throw final.error;
    return final.value;
  }
  throw new AiError("failed", "Claude stopped without an answer");
}

function modelFromUsage(usage: unknown): string {
  return (isObject(usage) ? Object.keys(usage)[0] : undefined) ?? "unknown";
}

/** Splits chunks of bytes or text into lines. Decodes across chunk edges; drops `\r`. */
export async function* linesOf(
  chunks: AsyncIterable<string | Uint8Array>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let rest = "";
  for await (const chunk of chunks) {
    rest +=
      typeof chunk === "string"
        ? chunk
        : decoder.decode(chunk, { stream: true });
    let at = rest.indexOf("\n");
    while (at !== -1) {
      yield rest.slice(0, at).replace(/\r$/, "");
      rest = rest.slice(at + 1);
      at = rest.indexOf("\n");
    }
  }
  rest += decoder.decode();
  if (rest !== "") yield rest.replace(/\r$/, "");
}
