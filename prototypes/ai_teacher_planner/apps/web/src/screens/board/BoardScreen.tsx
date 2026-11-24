import { addDays, type Fortnight, isIsoDate, mondayOf } from "@planner/domain";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import {
  useBoardDays,
  useBoardSlots,
  useConfig,
  useEvents,
  useFortnights,
  useLastDaysBeforeBreaks,
  useTimetable,
} from "../../api/queries.ts";
import { Button } from "../../components/ui/button.tsx";
import {
  EmptyState,
  ErrorState,
  Loading,
} from "../../components/ui/states.tsx";
import { longDate } from "../../lib/dates.ts";
import { possibleOf } from "../../lib/possible.ts";
import {
  boardFor,
  fortnightContaining,
  weekContaining,
  weekFor,
  weeksOf,
  weekToShow,
} from "./board-model.ts";
import { FortnightGrid, WeekPanel } from "./FortnightGrid.tsx";
import { GroupFilter } from "./GroupFilter.tsx";
import { groupsParam, parseGroups, toggleGroup } from "./group-filter.ts";

/** A fortnight is named by its first Monday (Week 1's, or Week 2's when there is no Week 1). */
const startOf = (f: Fortnight) => f.w1 ?? f.w2 ?? "";
const rangeOf = (f: Fortnight | undefined) =>
  f ? { from: startOf(f), to: addDays(f.w2 ?? f.w1 ?? "", 6) } : null;

/** Shown when no fortnight holds or follows a date (the address or the date field). */
const noFortnightOn = (iso: string) =>
  `There is no fortnight on or after ${longDate(iso)}.`;

export function BoardScreen() {
  const [params, setParams] = useSearchParams();
  const [notice, setNotice] = useState<string | null>(null);
  const config = useConfig();
  const fortnights = useFortnights();
  const timetable = useTimetable();
  const events = useEvents();
  const lastDays = useLastDaysBeforeBreaks();
  const weekView = params.get("view") === "week";

  const list = fortnights.data;
  const asked = params.get("w1");
  // A new address (Back, a pasted link) must not keep an old date-field message.
  const [seenAsked, setSeenAsked] = useState(asked);
  if (seenAsked !== asked) {
    setSeenAsked(asked);
    setNotice(null);
  }
  const askedDate = asked && isIsoDate(asked) ? asked : null;
  const index = useMemo(() => {
    if (!list || list.length === 0) return -1;
    if (askedDate) {
      const named = fortnightContaining(list, askedDate);
      return named ? list.indexOf(named) : -1;
    }
    const today = config.data?.today;
    if (!today) return -1;
    const here = fortnightContaining(list, today);
    return here ? list.indexOf(here) : list.length - 1;
  }, [list, askedDate, config.data?.today]);
  const mondays = useMemo(() => (list ? weeksOf(list) : []), [list]);
  const weekIndex = useMemo(() => {
    if (mondays.length === 0) return -1;
    let monday: string | null;
    if (askedDate) monday = weekContaining(mondays, mondayOf(askedDate));
    else {
      const today = config.data?.today;
      if (!today) return -1;
      monday = weekToShow(mondays, today) ?? mondays.at(-1) ?? null;
    }
    return monday ? mondays.indexOf(monday) : -1;
  }, [mondays, askedDate, config.data?.today]);
  const mondayShown = weekIndex >= 0 ? mondays[weekIndex] : undefined;
  const current = index >= 0 ? list?.[index] : undefined;
  const noFortnight =
    askedDate !== null &&
    list !== undefined &&
    (weekView ? weekIndex : index) < 0
      ? noFortnightOn(askedDate)
      : null;
  const message = notice ?? noFortnight;
  const range = weekView
    ? mondayShown
      ? { from: mondayShown, to: addDays(mondayShown, 6) }
      : null
    : rangeOf(current);
  const days = useBoardDays(range?.from ?? null, range?.to ?? null);
  const slots = useBoardSlots(range?.from ?? null, range?.to ?? null);

  const failed = [config, fortnights, timetable, days, slots, events].find(
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

  /** Move to a date, keeping the filter and the view. */
  const openAt = (w1: string | undefined | null) => {
    if (!w1) return;
    setNotice(null);
    const next = new URLSearchParams(params);
    next.set("w1", w1);
    setParams(next);
  };
  const open = (f: Fortnight | undefined | null) => openAt(f && startOf(f));
  const setView = (view: "fortnight" | "week") => {
    const next = new URLSearchParams(params);
    if (view === "week") next.set("view", "week");
    else next.delete("view");
    setParams(next);
  };
  const knownGroups = timetable.data.groups.map((g) => g.id);
  const chosen = parseGroups(params.get("groups"), knownGroups);
  const setChosen = (value: ReadonlySet<string> | null) => {
    const next = new URLSearchParams(params);
    const text = groupsParam(value, knownGroups);
    if (text) next.set("groups", text);
    else next.delete("groups");
    setParams(next);
  };
  const options = { groups: chosen, lastDays: lastDays.data };
  const colours = new Map(
    timetable.data.groups.map((g) => [g.id, g.colour] as const),
  );
  const ready = !weekView && current && days.data && slots.data;
  const board = ready
    ? boardFor(
        current,
        days.data,
        slots.data,
        timetable.data.versions,
        possibleOf(events.data, timetable.data.groups),
        options,
      )
    : null;
  const oneWeek =
    weekView && mondayShown && days.data && slots.data
      ? weekFor(
          mondayShown,
          days.data,
          slots.data,
          timetable.data.versions,
          possibleOf(events.data, timetable.data.groups),
          options,
        )
      : null;

  return (
    <section aria-labelledby="board-title">
      <h1 id="board-title" className="text-2xl font-semibold">
        Board
      </h1>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <fieldset className="m-0 flex min-w-0 gap-1 border-0 p-0">
          <legend className="sr-only">View</legend>
          <Button
            type="button"
            aria-pressed={!weekView}
            onClick={() => setView("fortnight")}
          >
            Fortnight
          </Button>
          <Button
            type="button"
            aria-pressed={weekView}
            onClick={() => setView("week")}
          >
            Week
          </Button>
        </fieldset>
        {weekView ? (
          <>
            <Button
              type="button"
              disabled={weekIndex <= 0}
              onClick={() => openAt(mondays[weekIndex - 1])}
            >
              Previous week
            </Button>
            <Button
              type="button"
              disabled={weekIndex < 0 || weekIndex >= mondays.length - 1}
              onClick={() => openAt(mondays[weekIndex + 1])}
            >
              Next week
            </Button>
            <Button
              type="button"
              onClick={() => {
                const today = config.data?.today;
                openAt(
                  (today ? weekToShow(mondays, today) : null) ?? mondays.at(-1),
                );
              }}
            >
              This week
            </Button>
          </>
        ) : (
          <>
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
          </>
        )}
        <label className="flex flex-col text-sm">
          {weekView
            ? "Go to the week with this date"
            : "Go to the fortnight with this date"}
          <input
            type="date"
            className="rounded-md border border-border bg-card px-2 py-1.5 text-card-foreground"
            onChange={(e) => {
              if (!e.target.value) return;
              if (weekView) {
                const found = weekContaining(mondays, mondayOf(e.target.value));
                if (found) openAt(found);
                else setNotice(noFortnightOn(e.target.value));
                return;
              }
              const found = fortnightContaining(list, e.target.value);
              if (found) open(found);
              else setNotice(noFortnightOn(e.target.value));
            }}
          />
        </label>
      </div>
      <div className="mt-3">
        <GroupFilter
          groups={timetable.data.groups}
          chosen={chosen}
          onToggle={(id) => setChosen(toggleGroup(chosen, id))}
          onAll={() => setChosen(null)}
        />
      </div>
      {message ? (
        <p role="status" className="mt-3 text-muted-foreground">
          {message}
        </p>
      ) : null}
      <div className="mt-6">
        {oneWeek ? (
          <WeekPanel
            side={oneWeek.labels[0] ?? "W1"}
            week={oneWeek}
            colours={colours}
          />
        ) : board && current ? (
          <FortnightGrid
            w1={board.w1}
            w2={board.w2}
            breakBefore={current.breakBefore}
            colours={colours}
          />
        ) : noFortnight ? null : (
          <Loading what="the fortnight" />
        )}
      </div>
    </section>
  );
}
