import {
  type DutyEntry,
  lessonsPerFortnight,
  PERIOD_TIMES,
  type Period,
  type TimetableEntry,
  type Weekday,
  type WeekLabel,
} from "@planner/domain";
import { useState } from "react";
import { ApiError } from "../../api/client.ts";
import {
  type TimetableData,
  type TimetableVersionData,
  useCreateTimetableVersion,
  useSaveTimetable,
  useTimetable,
} from "../../api/queries.ts";
import { Button } from "../../components/ui/button.tsx";
import { ErrorState, Loading } from "../../components/ui/states.tsx";
import { longDate } from "../../lib/dates.ts";
import { TimetablePicture } from "./TimetablePicture.tsx";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;
const PERIODS: Period[] = [1, 2, 3, 4, 5, 6];
const WEEKS: { label: WeekLabel; name: string }[] = [
  { label: "W1", name: "Week 1" },
  { label: "W2", name: "Week 2" },
];
const control =
  "w-full min-w-0 rounded-md border border-border bg-card px-1.5 py-1 text-sm text-card-foreground";

interface Cell {
  groupId: string;
  room: string;
  duty: string;
}
type Draft = Record<string, Cell>;
const keyOf = (w: WeekLabel, d: number, p: number) => `${w}-${d}-${p}`;
const EMPTY: Cell = { groupId: "", room: "", duty: "" };

function draftOf(version: TimetableVersionData): Draft {
  const draft: Draft = {};
  for (const e of version.entries)
    draft[keyOf(e.week, e.weekday, e.period)] = {
      groupId: e.groupId,
      room: e.room ?? "",
      duty: "",
    };
  for (const d of version.duties) {
    const k = keyOf(d.week, d.weekday, d.period);
    draft[k] = { ...(draft[k] ?? EMPTY), duty: d.label };
  }
  return draft;
}

function entriesOf(draft: Draft): {
  entries: TimetableEntry[];
  duties: DutyEntry[];
} {
  const entries: TimetableEntry[] = [];
  const duties: DutyEntry[] = [];
  for (const { label } of WEEKS)
    for (let d = 1; d <= 5; d++)
      for (const p of PERIODS) {
        const cell = draft[keyOf(label, d, p)];
        if (!cell) continue;
        const at = { week: label, weekday: d as Weekday, period: p };
        if (cell.groupId !== "")
          entries.push({
            ...at,
            groupId: cell.groupId,
            room: cell.room.trim() === "" ? null : cell.room.trim(),
          });
        if (cell.duty.trim() !== "")
          duties.push({ ...at, label: cell.duty.trim() });
      }
  return { entries, duties };
}

const lessons = (n: number) => `${n} ${n === 1 ? "lesson" : "lessons"}`;

function Totals({
  version,
  groups,
}: {
  version: TimetableVersionData;
  groups: TimetableData["groups"];
}) {
  const totals = lessonsPerFortnight(version);
  return (
    <div>
      <h3 className="font-semibold">Lessons per fortnight</h3>
      <ul className="mt-1 space-y-1">
        {groups.map((g) => {
          const t = totals[g.id] ?? { W1: 0, W2: 0, total: 0 };
          return (
            <li key={g.id}>
              {g.id}: {lessons(t.total)} (Week 1: {t.W1}, Week 2: {t.W2})
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function WeekGrid({
  week,
  draft,
  groups,
  onChange,
}: {
  week: { label: WeekLabel; name: string };
  draft: Draft;
  groups: TimetableData["groups"];
  onChange: (key: string, patch: Partial<Cell>) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-collapse">
        <caption className="pb-2 text-left font-semibold">{week.name}</caption>
        <thead>
          <tr>
            <td className="w-24" />
            {DAYS.map((day) => (
              <th key={day} scope="col" className="px-1 pb-1 text-left text-sm">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERIODS.map((p) => (
            <tr key={p} className="border-t border-border align-top">
              <th scope="row" className="py-1 pr-2 text-left text-sm">
                P{p}
                <br />
                <span className="font-normal text-muted-foreground">
                  {PERIOD_TIMES[p].start} to {PERIOD_TIMES[p].end}
                </span>
              </th>
              {DAYS.map((day, i) => {
                const k = keyOf(week.label, i + 1, p);
                const cell = draft[k] ?? EMPTY;
                const name = `${week.name}, ${day}, period ${p}`;
                return (
                  <td key={day} className="space-y-1 p-1">
                    <select
                      aria-label={name}
                      value={cell.groupId}
                      onChange={(e) => onChange(k, { groupId: e.target.value })}
                      className={control}
                    >
                      <option value="">Empty</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.id}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      aria-label={`${name}, room`}
                      placeholder="Room"
                      value={cell.room}
                      onChange={(e) => onChange(k, { room: e.target.value })}
                      className={control}
                    />
                    <input
                      type="text"
                      aria-label={`${name}, duty`}
                      placeholder="Duty"
                      value={cell.duty}
                      onChange={(e) => onChange(k, { duty: e.target.value })}
                      className={control}
                    />
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

function VersionEditor({
  version,
  groups,
  save,
}: {
  version: TimetableVersionData;
  groups: TimetableData["groups"];
  save: ReturnType<typeof useSaveTimetable>;
}) {
  // Starts from the server's version; the editor is keyed on the version id only,
  // so a save and its refetch neither reset the draft nor the "saved" message.
  const [draft, setDraft] = useState(() => draftOf(version));
  const current: TimetableVersionData = { ...version, ...entriesOf(draft) };
  const change = (key: string, patch: Partial<Cell>) => {
    save.reset();
    setDraft((d) => ({ ...d, [key]: { ...(d[key] ?? EMPTY), ...patch } }));
  };
  return (
    <div className="mt-4 flex flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1 space-y-6">
        {WEEKS.map((w) => (
          <WeekGrid
            key={w.label}
            week={w}
            draft={draft}
            groups={groups}
            onChange={change}
          />
        ))}
      </div>
      <aside className="space-y-4 lg:w-72">
        <Totals version={current} groups={groups} />
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="primary"
            disabled={save.isPending}
            onClick={() => {
              const { entries, duties } = entriesOf(draft);
              save.mutate({ id: version.id, entries, duties });
            }}
          >
            Save the timetable
          </Button>
          {save.isSuccess ? <span role="status">Timetable saved.</span> : null}
        </div>
        {save.isError ? (
          <ErrorState
            title="The timetable was not saved"
            message={save.error.message}
          >
            {save.error instanceof ApiError && save.error.issues.length > 0 ? (
              <ul className="mt-2 list-disc pl-5">
                {save.error.issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            ) : null}
          </ErrorState>
        ) : null}
      </aside>
    </div>
  );
}

function NewVersion({
  copyOf,
  onCreated,
}: {
  copyOf: string;
  onCreated: (id: string) => void;
}) {
  const [from, setFrom] = useState("");
  const create = useCreateTimetableVersion();
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2">
        My timetable changes from
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-md border border-border bg-card px-2 py-1"
        />
      </label>
      <Button
        type="button"
        disabled={from === "" || create.isPending}
        onClick={() =>
          create.mutate(
            { validFrom: from, copyOf },
            { onSuccess: (v) => onCreated(v.id) },
          )
        }
      >
        Copy this grid into a new version
      </Button>
      {create.isError ? (
        <span role="alert" className="text-danger">
          {create.error.message}
        </span>
      ) : null}
    </div>
  );
}

export function TimetableEditor() {
  const timetable = useTimetable();
  const [chosen, setChosen] = useState<string | null>(null);
  // bumped when an accepted suggestion replaced the stored grid, so the editor starts again from it
  const [applied, setApplied] = useState(0);
  const save = useSaveTimetable();
  const data = timetable.data;
  const versions = data?.versions ?? [];
  const version =
    versions.find((v) => v.id === chosen) ?? versions[versions.length - 1];
  return (
    <section
      aria-labelledby="timetable-title"
      className="rounded-lg border border-border bg-card p-4"
    >
      <h2 id="timetable-title" className="text-xl font-semibold">
        Timetable
      </h2>
      {timetable.isPending ? <Loading what="the timetable" /> : null}
      {timetable.isError ? (
        <ErrorState message={timetable.error.message} />
      ) : null}
      {data && !version ? (
        <p className="mt-2 text-muted-foreground">There is no timetable yet.</p>
      ) : null}
      {data && version ? (
        <>
          {versions.length > 1 ? (
            <label className="mt-3 flex items-center gap-2">
              Timetable version
              <select
                value={version.id}
                onChange={(e) => {
                  save.reset();
                  setChosen(e.target.value);
                }}
                className="rounded-md border border-border bg-card px-2 py-1"
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    From {longDate(v.validFrom)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="mt-2 text-muted-foreground">
              From {longDate(version.validFrom)}
            </p>
          )}
          <TimetablePicture
            version={version}
            onApplied={() => {
              save.reset();
              setApplied((n) => n + 1);
            }}
          />
          <VersionEditor
            key={`${version.id}-${applied}`}
            version={version}
            groups={data.groups}
            save={save}
          />
          <NewVersion copyOf={version.id} onCreated={setChosen} />
        </>
      ) : null}
    </section>
  );
}
