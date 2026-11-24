import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { needsBuild } from "./start.ts";

function webFolder() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-start-"));
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "main.tsx"), "x");
  return dir;
}
const at = (file: string, seconds: number) => {
  const t = new Date(seconds * 1000);
  fs.utimesSync(file, t, t);
};

test("a web app that was never built needs a build", () => {
  expect(needsBuild(webFolder())).toBe(true);
});

test("a build newer than every source file does not", () => {
  const dir = webFolder();
  fs.mkdirSync(path.join(dir, "dist"));
  fs.writeFileSync(path.join(dir, "dist", "index.html"), "x");
  at(path.join(dir, "src", "main.tsx"), 1000);
  at(path.join(dir, "dist", "index.html"), 2000);
  expect(needsBuild(dir)).toBe(false);
});

test("touching a source file, even a nested one, asks for a new build", () => {
  const dir = webFolder();
  fs.mkdirSync(path.join(dir, "dist"));
  fs.writeFileSync(path.join(dir, "dist", "index.html"), "x");
  fs.mkdirSync(path.join(dir, "src", "screens"));
  fs.writeFileSync(path.join(dir, "src", "screens", "a.tsx"), "x");
  at(path.join(dir, "src", "main.tsx"), 1000);
  at(path.join(dir, "dist", "index.html"), 2000);
  at(path.join(dir, "src", "screens", "a.tsx"), 3000);
  expect(needsBuild(dir)).toBe(true);
});
