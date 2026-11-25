import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { AiError, type AiProgress } from "./port.ts";
import { linesOf, parseStream } from "./stream.ts";

const here = dirname(fileURLToPath(import.meta.url));
/** The recorded run, one string per line (5 lines: init, assistant, user, rate limit, result). */
export const recordedLines = readFileSync(
  join(here, "__fixtures__/claude-stream-ok.ndjson"),
  "utf8",
)
  .split("\n")
  .filter((l) => l.trim() !== "");

async function* from(lines: string[]): AsyncGenerator<string> {
  for (const l of lines) yield l;
}

/** The recording with the last (result) line changed. */
export function withResult(change: (r: Record<string, unknown>) => void) {
  const lines = [...recordedLines];
  const result = JSON.parse(lines.at(-1) ?? "{}") as Record<string, unknown>;
  change(result);
  lines[lines.length - 1] = JSON.stringify(result);
  return lines;
}

async function rejection(p: Promise<unknown>): Promise<AiError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AiError);
    return e as AiError;
  }
  throw new Error("expected the promise to reject");
}

describe("parseStream, against the recorded run", () => {
  test("the recording is the shape the parser relies on", () => {
    const types = recordedLines.map((l) => JSON.parse(l).type);
    expect(types).toEqual([
      "system",
      "assistant",
      "user",
      "rate_limit_event",
      "result",
    ]);
  });

  test("gives the structured output and the model name", async () => {
    const out = await parseStream(from(recordedLines), () => {});
    expect(out).toEqual({ output: { ok: true }, model: "claude-sonnet-5-5" });
  });

  test("reports plain progress notes, never the raw stream", async () => {
    const seen: AiProgress[] = [];
    await parseStream(from(recordedLines), (p) => seen.push(p));
    expect(seen).toEqual([
      { kind: "working", note: "Connected to Claude" },
      { kind: "working", note: "Writing the answer" },
    ]);
  });

  test("a web search or fetch is announced in plain words", async () => {
    const lines = [...recordedLines];
    const assistant = JSON.parse(lines[1] ?? "{}");
    assistant.message.content = [
      { type: "tool_use", name: "WebSearch", input: { query: "x" } },
      { type: "tool_use", name: "WebFetch", input: { url: "https://x.org" } },
      { type: "text", text: "thinking out loud" },
    ];
    lines[1] = JSON.stringify(assistant);
    const seen: AiProgress[] = [];
    await parseStream(from(lines), (p) => seen.push(p));
    expect(seen.map((p) => (p.kind === "working" ? p.note : p.kind))).toEqual([
      "Connected to Claude",
      "Searching the web",
      "Reading a web page",
      "Working",
    ]);
  });

  test("blank lines and lines that are not JSON are skipped", async () => {
    const out = await parseStream(
      from(["", "warning: not json", ...recordedLines, "  "]),
      () => {},
    );
    expect(out.output).toEqual({ ok: true });
  });

  test("without an init line, the model comes from the result's usage", async () => {
    const out = await parseStream(from(recordedLines.slice(1)), () => {});
    expect(out.model).toBe("claude-sonnet-5-5");
  });
});

describe("parseStream, failures derived from the recording", () => {
  test("a stream that ends without a result is failed", async () => {
    const e = await rejection(
      parseStream(from(recordedLines.slice(0, 4)), () => {}),
    );
    expect(e.reason).toBe("failed");
    expect(e.message).toMatch(/without an answer/);
  });

  test("an empty stream is failed too", async () => {
    expect((await rejection(parseStream(from([]), () => {}))).reason).toBe(
      "failed",
    );
  });

  test("an error result is failed, carrying Claude's own words", async () => {
    const lines = withResult((r) => {
      r.subtype = "error_during_execution";
      r.is_error = true;
      r.result = "The model is overloaded";
      delete r.structured_output;
    });
    const e = await rejection(parseStream(from(lines), () => {}));
    expect(e.reason).toBe("failed");
    expect(e.message).toContain("The model is overloaded");
  });

  test("a success result with no structured output is invalid-output", async () => {
    const lines = withResult((r) => {
      delete r.structured_output;
    });
    const e = await rejection(parseStream(from(lines), () => {}));
    expect(e.reason).toBe("invalid-output");
  });
});

describe("linesOf", () => {
  const enc = new TextEncoder();
  async function* chunks(...c: (string | Uint8Array)[]) {
    for (const x of c) yield x;
  }
  async function all(g: AsyncIterable<string>) {
    const out: string[] = [];
    for await (const l of g) out.push(l);
    return out;
  }

  test("joins lines split across chunks and flushes an unterminated last line", async () => {
    expect(
      await all(linesOf(chunks('{"a":', "1}\n{", '"b":2}\n', "tail"))),
    ).toEqual(['{"a":1}', '{"b":2}', "tail"]);
  });

  test("a multi-byte character cut between two chunks survives", async () => {
    const bytes = enc.encode("café\n");
    const cut = bytes.length - 2; // inside the two-byte "é"
    expect(
      await all(linesOf(chunks(bytes.slice(0, cut), bytes.slice(cut)))),
    ).toEqual(["café"]);
  });

  test("handles CRLF", async () => {
    expect(await all(linesOf(chunks("a\r\nb\r\n")))).toEqual(["a", "b"]);
  });
});
