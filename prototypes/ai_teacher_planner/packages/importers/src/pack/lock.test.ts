import { syntheticPack } from "@planner/fixtures";
import { expect, test } from "vitest";
import { isLockedAndIntact, lockPack, packHash } from "./lock.ts";

const now = new Date("2026-11-25T10:00:00Z");

test("a pack with an unmapped point cannot be locked", async () => {
  const pack = syntheticPack();
  const withUnmapped = {
    ...pack,
    chapters: pack.chapters.map((c) =>
      c.id === "ch5" ? { ...c, specPointIds: [] } : c,
    ),
  };
  await expect(lockPack(withUnmapped, now)).rejects.toThrow(/unmapped/);
});

test("a pack with a broken reference cannot be locked", async () => {
  const pack = syntheticPack();
  const broken = {
    ...pack,
    chapters: pack.chapters.map((c) =>
      c.id === "ch2" ? { ...c, specPointIds: ["nope"] } : c,
    ),
  };
  await expect(lockPack(broken, now)).rejects.toThrow(/ch2/);
});

test("locking sets the hash and the time, and the hash ignores key order", async () => {
  const pack = syntheticPack();
  const locked = await lockPack(pack, now);
  expect(locked.lockedAt).toBe("2026-11-25T10:00:00.000Z");
  expect(locked.hash).toMatch(/^[0-9a-f]{64}$/);
  expect(locked.hash).toBe(await packHash(pack));
  // The same pack with its keys written in another order, and with lock fields filled in.
  const shuffled = JSON.parse(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(pack)
          .reverse()
          .map(([k, v]) => [k, v]),
      ),
    ),
  );
  expect(await packHash(shuffled)).toBe(locked.hash);
  expect(await packHash(locked)).toBe(locked.hash);
  // A real change moves the hash.
  expect(await packHash({ ...pack, version: "2026.2" })).not.toBe(locked.hash);
});

test("an unlocked pack is not locked and intact; a locked one is", async () => {
  const pack = syntheticPack();
  expect(await isLockedAndIntact(pack)).toBe(false);
  expect(await isLockedAndIntact(await lockPack(pack, now))).toBe(true);
});

test("editing a locked pack is detected", async () => {
  const locked = await lockPack(syntheticPack(), now);
  expect(await isLockedAndIntact({ ...locked, subject: "x" })).toBe(false);
});
