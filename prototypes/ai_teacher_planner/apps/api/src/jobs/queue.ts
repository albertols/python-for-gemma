/** One unit of work for the queue. */
export interface QueueEntry {
  id: string;
  /** Resolves when the work is over, whatever its outcome. `signal` aborts when it is cancelled. */
  run(signal: AbortSignal): Promise<void>;
  /** Called when the entry is cancelled before it ever started. */
  onCancelledWhileQueued(): void;
}

/** Runs entries one at a time, in the order they were added. A failing entry never stops the next. */
export class JobQueue {
  private readonly waiting: QueueEntry[] = [];
  private current: { id: string; controller: AbortController } | null = null;
  private idleWaiters: (() => void)[] = [];

  enqueue(entry: QueueEntry): void {
    this.waiting.push(entry);
    this.drain();
  }

  /** What was cancelled: a queued entry (it never runs), the running one (its signal aborts), or nothing. */
  cancel(id: string): "queued" | "running" | "none" {
    const at = this.waiting.findIndex((e) => e.id === id);
    if (at !== -1) {
      const [entry] = this.waiting.splice(at, 1);
      entry?.onCancelledWhileQueued();
      this.settleIfIdle();
      return "queued";
    }
    if (this.current?.id === id) {
      this.current.controller.abort();
      return "running";
    }
    return "none";
  }

  whenIdle(): Promise<void> {
    if (this.isIdle()) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private isIdle(): boolean {
    return this.current === null && this.waiting.length === 0;
  }

  private settleIfIdle(): void {
    if (!this.isIdle()) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  private drain(): void {
    if (this.current) return;
    const entry = this.waiting.shift();
    if (!entry) {
      this.settleIfIdle();
      return;
    }
    const controller = new AbortController();
    this.current = { id: entry.id, controller };
    entry
      .run(controller.signal)
      .catch((e: unknown) => console.error(e))
      .finally(() => {
        this.current = null;
        this.drain();
      });
  }
}

/** What each run has said so far, so that a browser that connects late hears all of it. */
export class JobEvents<E> {
  private readonly history = new Map<string, E[]>();
  private readonly listeners = new Map<string, Set<(e: E) => void>>();

  /** `keepRuns` is how many runs keep their history; the oldest is forgotten first. */
  private readonly keepRuns: number;
  constructor(keepRuns = 50) {
    this.keepRuns = keepRuns;
  }

  emit(id: string, event: E): void {
    let past = this.history.get(id);
    if (!past) {
      past = [];
      this.history.set(id, past);
      const oldest = this.history.keys().next().value;
      if (this.history.size > this.keepRuns && oldest !== undefined) {
        this.history.delete(oldest);
        this.listeners.delete(oldest);
      }
    }
    past.push(event);
    for (const listener of this.listeners.get(id) ?? []) listener(event);
  }

  /** Replays the history to `listener`, then calls it with each new event. Returns the way to stop. */
  subscribe(id: string, listener: (e: E) => void): () => void {
    for (const event of this.history.get(id) ?? []) listener(event);
    let set = this.listeners.get(id);
    if (!set) {
      set = new Set();
      this.listeners.set(id, set);
    }
    set.add(listener);
    return () => set.delete(listener);
  }

  has(id: string): boolean {
    return this.history.has(id);
  }
}
