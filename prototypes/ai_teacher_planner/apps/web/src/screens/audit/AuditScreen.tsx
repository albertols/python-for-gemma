import {
  type AuditData,
  type Exam,
  useAudit,
  useExams,
  useTimetable,
} from "../../api/queries.ts";
import { GroupBadge } from "../../components/GroupBadge.tsx";
import {
  EmptyState,
  ErrorState,
  Loading,
} from "../../components/ui/states.tsx";
import { fullDayWithYear, longDate } from "../../lib/dates.ts";

const TERM = { T1: "Term 1", T2: "Term 2", T3: "Term 3" } as const;
const plural = (n: number) => (n === 1 ? "1 lesson" : `${n} lessons`);
const cell = "border border-border px-3 py-2 text-left align-top";

export function AuditScreen() {
  const audit = useAudit();
  const timetable = useTimetable();
  const exams = useExams();
  const failed = audit.error ?? timetable.error ?? exams.error;
  if (failed) return <ErrorState message={failed.message} />;
  if (!audit.data || !timetable.data || !exams.data)
    return <Loading what="the slot audit" />;

  const colours = new Map(timetable.data.groups.map((g) => [g.id, g.colour]));
  return (
    <section aria-labelledby="audit-title">
      <h1 id="audit-title" className="text-2xl font-semibold">
        Slot audit
      </h1>
      <AuditView audit={audit.data} exams={exams.data} colours={colours} />
    </section>
  );
}

/** The guiding sentence, the table and the two lists. Pure: it takes the audit as data. */
export function AuditView({
  audit,
  exams,
  colours,
}: {
  audit: AuditData;
  exams: readonly Exam[];
  colours: ReadonlyMap<string, string>;
}) {
  const { rows, lost, daysOff, lostByReason, lastLesson } = audit;
  const groupIds = Object.keys(rows[0]?.perGroup ?? {});
  /** Lessons that took place or are covered; a cancelled one is counted apart. */
  const taught = (id: string) =>
    rows.reduce(
      (n, r) => n + (r.perGroup[id]?.open ?? 0) + (r.perGroup[id]?.cover ?? 0),
      0,
    );
  const cancelled = (id: string) =>
    rows.reduce((n, r) => n + (r.perGroup[id]?.cancelled ?? 0), 0);

  return (
    <>
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
                    {longDate(r.block.from)} to {longDate(r.block.to)}
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

      <h2 className="mt-8 text-lg font-semibold">Lessons that will not run</h2>
      {lostByReason.length === 0 ? (
        <p className="mt-2 text-muted-foreground">
          Nothing is stopping a lesson from running.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {lostByReason.map((r) => (
            <li
              key={r.reason}
              data-reason={r.reason}
              className="rounded-lg border border-border bg-card p-3"
            >
              <p className="font-medium">{r.reason}</p>
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {Object.entries(r.perGroup).map(([id, n]) => (
                  <li key={id} data-group={id}>
                    <GroupBadge id={id} colour={colours.get(id)} />
                    {`: ${plural(n)}`}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-8 text-lg font-semibold">
        Last lesson and official exams
      </h2>
      <ul className="mt-2 space-y-2">
        {Object.entries(lastLesson).map(([id, last]) => {
          const mine = exams.filter((e) => e.groupIds.includes(id));
          return (
            <li
              key={id}
              data-last-lesson={id}
              className="rounded-lg border border-border bg-card p-3"
            >
              <p className="font-medium">
                <GroupBadge id={id} colour={colours.get(id)} />
                {last === null
                  ? ": No lesson left this year"
                  : `: last lesson ${fullDayWithYear(last)}`}
              </p>
              {mine.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No official exams.
                </p>
              ) : (
                <ul className="text-sm text-muted-foreground">
                  {mine.map((e) => (
                    <li key={e.id}>
                      {e.code} {e.title}, {fullDayWithYear(e.date)}, {e.session}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

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
    </>
  );
}
