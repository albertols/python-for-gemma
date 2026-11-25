import { expect, test } from "vitest";
import { JobEvents, JobQueue, type QueueEntry } from "./queue.ts";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function entry(id: string, log: string[], work?: () => Promise<void>) {
  const gate: { open: () => void } = { open: () => {} };
  const opened = new Promise<void>((r) => {
    gate.open = r;
  });
  const e: QueueEntry & { signal?: AbortSignal; cancelledQueued: boolean } = {
    id,
    cancelledQueued: false,
    async run(signal) {
      e.signal = signal;
      log.push(`start ${id}`);
      await (work ? work() : opened);
      log.push(`end ${id}`);
    },
    onCancelledWhileQueued() {
      e.cancelledQueued = true;
    },
  };
  return { e, gate };
}

test("entries run one at a time, in the order they were added", async () => {
  const log: string[] = [];
  const q = new JobQueue();
  const a = entry("a", log);
  const b = entry("b", log);
  const c = entry("c", log);
  q.enqueue(a.e);
  q.enqueue(b.e);
  q.enqueue(c.e);
  await tick();
  expect(log).toEqual(["start a"]);
  a.gate.open();
  await tick();
  expect(log).toEqual(["start a", "end a", "start b"]);
  b.gate.open();
  await tick();
  c.gate.open();
  await q.whenIdle();
  expect(log).toEqual([
    "start a",
    "end a",
    "start b",
    "end b",
    "start c",
    "end c",
  ]);
});

test("an entry that throws does not stop the ones behind it", async () => {
  const log: string[] = [];
  const q = new JobQueue();
  q.enqueue(
    entry("bad", log, async () => {
      throw new Error("boom");
    }).e,
  );
  const next = entry("next", log, async () => {});
  q.enqueue(next.e);
  await q.whenIdle();
  expect(log).toContain("end next");
});

test("cancelling a queued entry removes it and tells it; cancelling the running one aborts its signal", async () => {
  const log: string[] = [];
  const q = new JobQueue();
  const a = entry("a", log, () => new Promise<void>(() => {}));
  const b = entry("b", log);
  q.enqueue(a.e);
  q.enqueue(b.e);
  await tick();
  expect(q.cancel("b")).toBe("queued");
  expect(b.e.cancelledQueued).toBe(true);
  expect(q.cancel("a")).toBe("running");
  expect(a.e.signal?.aborted).toBe(true);
  expect(q.cancel("nobody")).toBe("none");
  expect(log).toEqual(["start a"]);
});

test("whenIdle resolves at once when nothing is queued", async () => {
  await expect(new JobQueue().whenIdle()).resolves.toBeUndefined();
});

test("a late subscriber is given what already happened, then what follows; unsubscribing stops it", () => {
  const events = new JobEvents<string>();
  events.emit("r1", "one");
  events.emit("r1", "two");
  const heard: string[] = [];
  const stop = events.subscribe("r1", (e) => heard.push(e));
  expect(heard).toEqual(["one", "two"]);
  events.emit("r1", "three");
  stop();
  events.emit("r1", "four");
  expect(heard).toEqual(["one", "two", "three"]);
  expect(events.has("r1")).toBe(true);
  expect(events.has("r2")).toBe(false);
  const other: string[] = [];
  events.subscribe("r2", (e) => other.push(e));
  expect(other).toEqual([]);
});

test("only the newest runs keep their history", () => {
  const events = new JobEvents<string>(2);
  events.emit("r1", "a");
  events.emit("r2", "b");
  events.emit("r3", "c");
  expect(events.has("r1")).toBe(false);
  expect(events.has("r2")).toBe(true);
  expect(events.has("r3")).toBe(true);
});
