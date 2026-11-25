import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { E2E_MARKER, loadConfig } from "./config.ts";

const made: string[] = [];
function folder(parent: string, withMarker: boolean) {
  const dir = fs.mkdtempSync(path.join(parent, "planner-cfg-"));
  made.push(dir);
  if (withMarker) fs.writeFileSync(path.join(dir, E2E_MARKER), "");
  return dir;
}
afterEach(() => {
  for (const d of made.splice(0))
    fs.rmSync(d, { recursive: true, force: true });
});

describe("loadConfig", () => {
  test("the host is always loopback", () =>
    expect(loadConfig({ HOST: "0.0.0.0", PLANNER_HOST: "0.0.0.0" }).host).toBe(
      "127.0.0.1",
    ));
  test("defaults", () =>
    expect(loadConfig({})).toMatchObject({
      port: 4319,
      ai: "claude",
      fixedToday: null,
    }));
  test("an invalid PLANNER_FIXED_TODAY is refused", () =>
    expect(() => loadConfig({ PLANNER_FIXED_TODAY: "tomorrow" })).toThrow());
  test("a valid PLANNER_FIXED_TODAY is kept", () =>
    expect(loadConfig({ PLANNER_FIXED_TODAY: "2026-11-20" }).fixedToday).toBe(
      "2026-11-20",
    ));
  test("an unknown AI mode is refused", () =>
    expect(() => loadConfig({ PLANNER_AI: "gpt" })).toThrow());
  test("an invalid port is refused", () =>
    expect(() => loadConfig({ PLANNER_PORT: "99999" })).toThrow());
  test("the time zone comes from PLANNER_TIME_ZONE, else the machine", () => {
    expect(loadConfig({ PLANNER_TIME_ZONE: "Europe/Madrid" }).timeZone).toBe(
      "Europe/Madrid",
    );
    expect(loadConfig({}).timeZone).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  });
  test("an unknown time zone is refused", () =>
    expect(() => loadConfig({ PLANNER_TIME_ZONE: "Mars/Base" })).toThrow());
  test("data and resources directories can be set", () =>
    expect(
      loadConfig({ PLANNER_DATA_DIR: "/x/d", PLANNER_RESOURCES_DIR: "/x/r" }),
    ).toMatchObject({ dataDir: "/x/d", resourcesDir: "/x/r" }));

  describe("PLANNER_TEST_ROUTES", () => {
    const on = (dir: string) =>
      loadConfig({ PLANNER_TEST_ROUTES: "1", PLANNER_DATA_DIR: dir });
    test("is off unless it is exactly 1", () =>
      expect(loadConfig({ PLANNER_DATA_DIR: "/unused" }).testRoutes).toBe(
        false,
      ));
    test("is allowed on a marked folder under the temporary folder", () =>
      expect(on(folder(os.tmpdir(), true)).testRoutes).toBe(true));
    test("is refused on a folder without the marker", () =>
      expect(() => on(folder(os.tmpdir(), false))).toThrow(
        /PLANNER_TEST_ROUTES=1 is refused.*not seeded/,
      ));
    test("is refused on a marked folder outside the temporary folder", () =>
      expect(() => on(folder(import.meta.dirname, true))).toThrow(
        /not under the temporary folder/,
      ));
  });
});
