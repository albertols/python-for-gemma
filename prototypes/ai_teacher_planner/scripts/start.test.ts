import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { needsBuild } from "./start.ts";

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const write = (root: string, rel: string, seconds: number) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "x");
  const t = new Date(seconds * 1000);
  fs.utimesSync(file, t, t);
};

/** A workspace with every build input at time 1000; no build yet. */
function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "planner-start-"));
  made.push(root);
  write(root, "apps/web/src/main.tsx", 1000);
  write(root, "apps/web/index.html", 1000);
  write(root, "apps/web/vite.config.ts", 1000);
  write(root, "packages/domain/src/index.ts", 1000);
  write(root, "packages/importers/src/index.ts", 1000);
  return root;
}
const built = (root: string, seconds = 2000) =>
  write(root, "apps/web/dist/index.html", seconds);

test("a web app that was never built needs a build", () => {
  expect(needsBuild(workspace())).toBe(true);
});

test("a build newer than every input does not", () => {
  const root = workspace();
  built(root);
  expect(needsBuild(root)).toBe(false);
});

test("touching a web source file, even a nested one, asks for a new build", () => {
  const root = workspace();
  built(root);
  write(root, "apps/web/src/screens/a.tsx", 3000);
  expect(needsBuild(root)).toBe(true);
});

test("a change under a shared package's src asks for a new build", () => {
  const root = workspace();
  built(root);
  write(root, "packages/domain/src/index.ts", 3000);
  expect(needsBuild(root)).toBe(true);
});

test("a change to index.html asks for a new build", () => {
  const root = workspace();
  built(root);
  write(root, "apps/web/index.html", 3000);
  expect(needsBuild(root)).toBe(true);
});

test("a change to vite.config.ts asks for a new build", () => {
  const root = workspace();
  built(root);
  write(root, "apps/web/vite.config.ts", 3000);
  expect(needsBuild(root)).toBe(true);
});
