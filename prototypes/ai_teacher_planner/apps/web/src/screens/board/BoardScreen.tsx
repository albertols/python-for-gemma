import { addDays, type Fortnight } from "@planner/domain";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import {
  useBoardDays,
  useBoardSlots,
  useConfig,
  useFortnights,
  useTimetable,
} from "../../api/queries.ts";
import { Button } from "../../components/ui/button.tsx";
import {
  EmptyState,
  ErrorState,
  Loading,
} from "../../components/ui/states.tsx";
import { longDate } from "../../lib/dates.ts";
import { boardFor, fortnightContaining } from "./board-model.ts";
import { FortnightGrid } from "./FortnightGrid.tsx";

/** A fortnight is named by its first Monday (Week 1's, or Week 2's when there is no Week 1). */
const startOf = (f: Fortnight) => f.w1 ?? f.w2 ?? "";
const rangeOf = (f: Fortnight | undefined) =>
  f ? { from: startOf(f), to: addDays(f.w2 ?? f.w1 ?? "", 6) } : null;

export function BoardScreen() {
  const [params, setParams] = useSearchParams();
  const [notice, setNotice] = useState<string | null>(null);
  const config = useConfig();
  const fortnights = useFortnights();
  const timetable = useTimetable();

  const list = fortnights.data;
  const asked = params.get("w1");
  const index = useMemo(() => {
    if (!list || list.length === 0) return -1;
    const named = asked ? list.findIndex((f) => startOf(f) === asked) : -1;
    if (named >= 0) return named;
    const today = config.data?.today;
    if (!today) return -1;
    const here = fortnightContaining(list, today);
    return here ? list.indexOf(here) : list.length - 1;
  }, [list, asked, config.data?.today]);
  const current = index >= 0 ? list?.[index] : undefined;
  const range = rangeOf(current);
  const days = useBoardDays(range?.from ?? null, range?.to ?? null);
  const slots = useBoardSlots(range?.from ?? null, range?.to ?? null);

  const failed = [config, fortnights, timetable, days, slots].find(
    (q) => q.isError,
  );
  if (failed?.error) return <ErrorState message={failed.error.message} />;
  if (!list || !timetable.data) return <Loading what="the board" />;
  if (list.length === 0)
    return (
      <section aria-labelledby="board-title">
        <h1 id="board-title" className="text-2xl font-semibold">
          Board
        </h1>
        <div className="mt-6">
          <EmptyState title="No fortnights yet">
            Import the school calendar on the Setup screen first.
          </EmptyState>
        </div>
      </section>
    );

  const open = (f: Fortnight | undefined | null) => {
    if (!f) return;
    setNotice(null);
    setParams({ w1: startOf(f) });
  };
  const colours = new Map(
    timetable.data.groups.map((g) => [g.id, g.colour] as const),
  );
  const ready = current && days.data && slots.data;
  const board = ready
    ? boardFor(current, days.data, slots.data, timetable.data.versions)
    : null;

  return (
    <section aria-labelledby="board-title">
      <h1 id="board-title" className="text-2xl font-semibold">
        Board
      </h1>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Button
          type="button"
          disabled={index <= 0}
          onClick={() => open(list[index - 1])}
        >
          Previous fortnight
        </Button>
        <Button
          type="button"
          disabled={index < 0 || index >= list.length - 1}
          onClick={() => open(list[index + 1])}
        >
          Next fortnight
        </Button>
        <Button
          type="button"
          onClick={() => {
            const today = config.data?.today;
            open(today ? fortnightContaining(list, today) : list.at(-1));
          }}
        >
          This fortnight
        </Button>
        <label className="flex flex-col text-sm">
          Go to the fortnight with this date
          <input
            type="date"
            className="rounded-md border border-border bg-card px-2 py-1.5 text-card-foreground"
            onChange={(e) => {
              if (!e.target.value) return;
              const found = fortnightContaining(list, e.target.value);
              if (found) open(found);
              else
                setNotice(
                  `There is no fortnight on or after ${longDate(e.target.value)}.`,
                );
            }}
          />
        </label>
      </div>
      {notice ? (
        <p role="status" className="mt-3 text-muted-foreground">
          {notice}
        </p>
      ) : null}
      <div className="mt-6">
        {board && current ? (
          <FortnightGrid
            w1={board.w1}
            w2={board.w2}
            breakBefore={current.breakBefore}
            colours={colours}
          />
        ) : (
          <Loading what="the fortnight" />
        )}
      </div>
    </section>
  );
}
