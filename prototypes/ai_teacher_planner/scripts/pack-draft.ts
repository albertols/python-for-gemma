// Drafts a curriculum pack from a specification PDF with the AI, and saves it for review.
//   pnpm pack:draft --course <id> --spec "<path under resources>" --units "Unit 1,Unit 2" \
//     --chapters <chapters.json> [--board X] [--subject X] [--version X]
// chapters.json is [{ "number": "1", "title": "..." }, ...]. Writes data/packs/<id>.draft.json
// (the pack) and <id>.draft-review.json (link reasons, doubts, issues). Nothing is locked or applied.
import fs from "node:fs";
import path from "node:path";
import { providerFor } from "../apps/api/src/ai-provider.ts";
import { loadConfig } from "../apps/api/src/config.ts";
import {
  createResourceGateway,
  type ResourceGateway,
} from "../apps/api/src/gateway/resource-gateway.ts";
import {
  type DraftPackArgs,
  draftPack,
} from "../apps/api/src/usecases/draft-pack.ts";
import type { AiProvider } from "../packages/ai/src/port.ts";

/** Runs the draft and saves it. Returns where it went and what needs her eye. */
export async function saveDraftPack(deps: {
  dataDir: string;
  gateway: ResourceGateway;
  ai: AiProvider;
  args: DraftPackArgs;
}): Promise<{ packFile: string; reviewFile: string; issues: string[] }> {
  // The course id becomes a file name: keep it to one plain segment.
  const id = deps.args.courseId;
  if (!/^[A-Za-z0-9._-]+$/.test(id) || id.startsWith("."))
    throw new Error(`"${id}" cannot be used as a course id in a file name.`);
  const result = await draftPack(
    { gateway: deps.gateway, ai: deps.ai },
    deps.args,
  );
  const dir = path.join(deps.dataDir, "packs");
  fs.mkdirSync(dir, { recursive: true });
  const packFile = path.join(dir, `${id}.draft.json`);
  const reviewFile = path.join(dir, `${id}.draft-review.json`);
  fs.writeFileSync(packFile, `${JSON.stringify(result.pack, null, 2)}\n`);
  fs.writeFileSync(
    reviewFile,
    `${JSON.stringify({ issues: result.issues, ...result.review, meta: result.meta }, null, 2)}\n`,
  );
  return { packFile, reviewFile, issues: result.issues };
}

function option(argv: string[], name: string): string | undefined {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 ? argv[at + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const argv = process.argv.slice(2);
  const course = option(argv, "course");
  const spec = option(argv, "spec");
  const units = option(argv, "units");
  const chaptersFile = option(argv, "chapters");
  if (!course || !spec || !units || !chaptersFile) {
    console.error(
      'Usage: pnpm pack:draft --course <id> --spec "<path>" --units "Unit 1,Unit 2" --chapters <chapters.json>',
    );
    process.exit(2);
  }
  try {
    const config = loadConfig(process.env);
    const ai = providerFor(config, process.env);
    if (!ai) throw new Error("AI is switched off (PLANNER_AI=off).");
    const status = await ai.available();
    if (!status.ok) throw new Error(status.reason);
    const chapters: unknown = JSON.parse(fs.readFileSync(chaptersFile, "utf8"));
    if (
      !Array.isArray(chapters) ||
      !chapters.every(
        (c) => typeof c?.number === "string" && typeof c?.title === "string",
      )
    )
      throw new Error("The chapters file must be a list of { number, title }.");
    const extras: { board?: string; subject?: string; version?: string } = {};
    for (const key of ["board", "subject", "version"] as const) {
      const value = option(argv, key);
      if (value !== undefined) extras[key] = value;
    }
    const done = await saveDraftPack({
      dataDir: config.dataDir,
      gateway: createResourceGateway(config.resourcesDir),
      ai,
      args: {
        courseId: course,
        specPath: spec,
        unitsInScope: units.split(",").map((u) => u.trim()),
        chapters,
        ...extras,
      },
    });
    console.log(`Draft saved to ${done.packFile}`);
    console.log(
      done.issues.length === 0
        ? "No issues found. Review it before it is locked."
        : `${done.issues.length} issue(s) for review:\n- ${done.issues.join("\n- ")}`,
    );
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
