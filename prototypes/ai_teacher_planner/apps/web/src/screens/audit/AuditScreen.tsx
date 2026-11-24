import { useAudit, useTimetable } from "../../api/queries.ts";
import { GroupBadge } from "../../components/GroupBadge.tsx";
import {
  EmptyState,
  ErrorState,
  Loading,
} from "../../components/ui/states.tsx";
import { fullDayWithYear, shortDate } from "../../lib/dates.ts";

const TERM = { T1: "Term 1", T2: "Term 2", T3: "Term 3" } as const;
const cell = "border border-border px-3 py-2 text-left align-top";

export function AuditScreen() {
  const audit = useAudit();
  const timetable = useTimetable();
  const failed = audit.error ?? timetable.error;
  if (failed) return <ErrorState message={failed.message} />;
  if (!audit.data || !timetable.data) return <Loading what="the slot audit" />;

  const { rows, lost, daysOff } = audit.data;
  const colours = new Map(timetable.data.groups.map((g) => [g.id, g.colour]));
  const groupIds = Object.keys(rows[0]?.perGroup ?? {});
  /** Lessons that took place or are covered; a cancelled one is counted apart. */
  const taught = (id: string, from = 0, to = rows.length) =>
    rows
      .slice(from, to)
      .reduce(
        (n, r) =>
          n + (r.perGroup[id]?.open ?? 0) + (r.perGroup[id]?.cover ?? 0),
        0,
      );
  const cancelled = (id: string) =>
    rows.reduce((n, r) => n + (r.perGroup[id]?.cancelled ?? 0), 0);

  return (
    <section aria-labelledby="audit-title">
      <h1 id="audit-title" className="text-2xl font-semibold">
        Slot audit
      </h1>
      <p className="mt-2">
        Compare these counts with your own timetable. If one is wrong, a date is
        wrong.
      </p>

      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Nothing to audit yet">
            Import the school calendar on the Setup screen first.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Lessons per group in each teaching block, with the year's total
            </caption>
            <thead>
              <tr>
                <th scope="col" className={cell}>
                  Teaching block
                </th>
                {groupIds.map((id) => (
                  <th key={id} scope="col" className={cell}>
                    <GroupBadge id={id} colour={colours.get(id)} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.block.id}>
                  <th scope="row" className={`${cell} font-normal`}>
                    <span className="font-medium">{TERM[r.block.termId]}</span>
                    {", "}
                    {shortDate(r.block.from)} to {shortDate(r.block.to)}
                  </th>
                  {groupIds.map((id) => {
                    const lostHere = r.perGroup[id]?.cancelled ?? 0;
                    return (
                      <td key={id} className={cell}>
                        {(r.perGroup[id]?.open ?? 0) +
                          (r.perGroup[id]?.cover ?? 0)}
                        {lostHere > 0 ? (
                          <span className="text-muted-foreground">
                            {" "}
                            ({lostHere} lost)
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className={cell}>
                  Year total
                </th>
                {groupIds.map((id) => (
                  <td key={id} className={`${cell} font-semibold`}>
                    {taught(id)}
                    {cancelled(id) > 0 ? (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        ({cancelled(id)} lost)
                      </span>
                    ) : null}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <h2 className="mt-8 text-lg font-semibold">Days off inside a block</h2>
      {daysOff.length === 0 ? (
        <p className="mt-2 text-muted-foreground">
          No weekdays inside a teaching block are days off.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {daysOff.map((d) => (
            <li
              key={d.date}
              className="rounded-lg border border-border bg-card p-3"
            >
              <p className="font-medium">
                {fullDayWithYear(d.date)}
                {d.text ? `: ${d.text}` : ""}
              </p>
              <p className="text-sm text-muted-foreground">
                {d.wouldHaveHad.length === 0
                  ? "No groups would have had a lesson."
                  : `Missed: ${d.wouldHaveHad
                      .map((m) => `${m.groupId}, period ${m.period}`)
                      .join("; ")}`}
              </p>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-8 text-lg font-semibold">Cancelled lessons</h2>
      {lost.length === 0 ? (
        <p className="mt-2 text-muted-foreground">
          No lessons have been cancelled. Lessons you lose to trips or
          disruptions will be listed here with their reason.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {lost.map((s) => (
            <li
              key={s.key}
              className="rounded-lg border border-border bg-card p-3"
            >
              {s.groupId}, period {s.period}, {fullDayWithYear(s.date)}
              {s.reasons.length
                ? `: ${s.reasons.map((r) => r.text).join(", ")}`
                : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
