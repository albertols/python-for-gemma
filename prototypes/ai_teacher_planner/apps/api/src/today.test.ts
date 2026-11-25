import { expect, test } from "vitest";
import { localIsoDate } from "./today.ts";

test("local date just after midnight in Madrid is the new day", () => {
  expect(localIsoDate(new Date("2026-11-23T23:13:00Z"), "Europe/Madrid")).toBe(
    "2026-11-24",
  );
  expect(localIsoDate(new Date("2026-11-23T22:30:00Z"), "Europe/Madrid")).toBe(
    "2026-11-23",
  );
});
