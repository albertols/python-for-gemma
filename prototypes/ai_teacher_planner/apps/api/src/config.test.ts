import { describe, expect, test } from "vitest";
import { loadConfig } from "./config.ts";

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
});
