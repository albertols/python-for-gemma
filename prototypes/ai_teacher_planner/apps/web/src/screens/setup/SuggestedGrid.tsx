import {
  cellKeyOf,
  diffTimetables,
  PERIOD_TIMES,
  type Period,
  timetableCellTexts,
  type Weekday,
  type WeekLabel,
} from "@planner/domain";
import type { TimetableVersionData } from "../../api/queries.ts";
import type { GridSuggestion } from "./timetable-suggestion.ts";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;
const PERIODS: Period[] = [1, 2, 3, 4, 5, 6];
const WEEKS: { label: WeekLabel; name: string }[] = [
  { label: "W1", name: "Week 1" },
  { label: "W2", name: "Week 2" },
];

/** One week of a grid, read-only. A changed cell is shaded and says in words what it was or what it becomes. */
function WeekTable({
  caption,
  week,
  texts,
  changed,
  side,
}: {
  caption: string;
  week: WeekLabel;
  texts: Map<string, string>;
  changed: Map<string, { from: string | null; to: string | null }>;
  side: "current" | "suggested";
}) {
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-sm">
        <caption className="pb-1 text-left font-semibold">{caption}</caption>
        <thead>
          <tr>
            <td className="w-10" />
            {DAYS.map((day) => (
              <th key={day} scope="col" className="px-1 pb-1 text-left">
                {day.slice(0, 3)}
                <span className="sr-only">{day.slice(3)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERIODS.map((p) => (
            <tr key={p} className="border-t border-border align-top">
              <th scope="row" className="py-1 pr-1 text-left font-normal">
                P{p}
                <span className="sr-only">
                  , {PERIOD_TIMES[p].start} to {PERIOD_TIMES[p].end}
                </span>
              </th>
              {DAYS.map((day, i) => {
                const key = cellKeyOf({
                  week,
                  weekday: (i + 1) as Weekday,
                  period: p,
                });
                const change = changed.get(key);
                const text = texts.get(key) ?? "";
                return (
                  <td
                    key={day}
                    data-changed={change ? "true" : "false"}
                    className={
                      change
                        ? "border-2 border-ai bg-note-bg p-1 text-note-fg"
                        : "p-1"
                    }
                  >
                    {text === "" ? (
                      <span className="text-muted-foreground">
                        <span aria-hidden="true">-</span>
                        <span className="sr-only">Empty</span>
                      </span>
                    ) : (
                      text
                    )}
                    {change ? (
                      <span className="block font-semibold">
                        {side === "suggested"
                          ? `Changed: was ${change.from ?? "empty"}`
                          : `Changed: now ${change.to ?? "empty"}`}
                      </span>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Her current grid and Claude's suggestion side by side, a pair of tables for each week.
 * Cells that differ are marked in both. Nothing here changes anything.
 */
export function SuggestedGrid({
  current,
  suggestion,
}: {
  current: TimetableVersionData;
  suggestion: Pick<GridSuggestion, "entries" | "duties">;
}) {
  const changes = diffTimetables(current, suggestion);
  const changed = new Map(
    changes.map((c) => [cellKeyOf(c), { from: c.from, to: c.to }]),
  );
  const now = timetableCellTexts(current);
  const next = timetableCellTexts(suggestion);
  return (
    <div className="space-y-4">
      <p className="font-medium">
        {changes.length === 0
          ? "The picture matches your timetable. Nothing would change."
          : `${changes.length} ${changes.length === 1 ? "cell differs" : "cells differ"} from your timetable.`}
      </p>
      {WEEKS.map((w) => (
        <div key={w.label} className="grid gap-4 lg:grid-cols-2">
          <WeekTable
            caption={`${w.name}, current`}
            week={w.label}
            texts={now}
            changed={changed}
            side="current"
          />
          <WeekTable
            caption={`${w.name}, suggested`}
            week={w.label}
            texts={next}
            changed={changed}
            side="suggested"
          />
        </div>
      ))}
    </div>
  );
}
