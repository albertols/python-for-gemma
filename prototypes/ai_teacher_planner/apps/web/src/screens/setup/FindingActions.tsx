import { useId, useState } from "react";
import {
  type ImportSummary,
  useDay,
  useRemoveLabel,
  useSetLabel,
  useSetResolution,
} from "../../api/queries.ts";
import { Button } from "../../components/ui/button.tsx";
import { longDate } from "../../lib/dates.ts";

type Finding = ImportSummary["shown"][number];

const MAX_TEXT = 200;
const field = "rounded-md border border-border bg-card px-2 py-1";
const WEEK = { W1: "Week 1", W2: "Week 2" } as const;

/** The two answers to "is this a day off?", for a warning that might be one. */
export function SettleButtons({
  finding,
  onDone,
}: {
  finding: Finding;
  onDone: (message: string) => void;
}) {
  const save = useSetResolution();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const ids = useId();
  const date = finding.date ?? "";
  const when = longDate(date);
  return (
    <div className="mt-1 space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={save.isPending}
          aria-label={`I have lessons that day: ${when}`}
          onClick={() =>
            save.mutate(
              { date, decision: "teaching-day", reason: null },
              { onSuccess: () => onDone(`${when}: you have lessons.`) },
            )
          }
        >
          I have lessons that day
        </Button>
        <Button
          type="button"
          aria-expanded={asking}
          aria-label={`No lessons that day: ${when}`}
          onClick={() => setAsking((a) => !a)}
        >
          No lessons that day
        </Button>
      </div>
      {asking ? (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor={`${ids}-reason`} className="block text-sm">
              Reason (optional)
            </label>
            <input
              id={`${ids}-reason`}
              type="text"
              className={field}
              maxLength={MAX_TEXT}
              aria-describedby={`${ids}-hint`}
              placeholder="For example, Staff training"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <p id={`${ids}-hint`} className="text-sm text-muted-foreground">
              No student names
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            disabled={save.isPending}
            onClick={() =>
              save.mutate(
                { date, decision: "no-lessons", reason },
                {
                  onSuccess: () =>
                    onDone(`${when}: no lessons. Its lessons are cancelled.`),
                },
              )
            }
          >
            Confirm no lessons
          </Button>
        </div>
      ) : null}
      {save.isError ? (
        <p role="alert" className="text-danger">
          {save.error.message}
        </p>
      ) : null}
    </div>
  );
}

/**
 * "Change week label" for a labelled pupil day. It shows nothing for any other
 * day, so a finding can offer it without knowing what kind of day it names.
 */
export function ChangeLabel({
  date,
  onDone,
}: {
  date: string;
  onDone: (message: string) => void;
}) {
  const day = useDay(date);
  const set = useSetLabel();
  const remove = useRemoveLabel();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState<"W1" | "W2">("W1");
  const [note, setNote] = useState("");
  const ids = useId();
  const d = day.data;
  if (!d?.pupilDay || d.weekLabel === null) return null;
  const when = longDate(date);
  const corrected = d.labelSource === "teacher";
  const failure = set.error ?? remove.error;
  return (
    <div className="mt-1 space-y-2">
      <p className="text-sm">
        {WEEK[d.weekLabel]}
        {corrected ? " (corrected by you)" : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          aria-expanded={open}
          aria-label={`Change week label: ${when}`}
          onClick={() => {
            setLabel(d.weekLabel === "W1" ? "W2" : "W1");
            setOpen((o) => !o);
          }}
        >
          Change week label
        </Button>
        {corrected ? (
          <Button
            type="button"
            disabled={remove.isPending}
            aria-label={`Use the calendar's label: ${when}`}
            onClick={() =>
              remove.mutate(date, {
                onSuccess: () => {
                  setOpen(false);
                  onDone(`${when}: back to the calendar's week label.`);
                },
              })
            }
          >
            Use the calendar's label
          </Button>
        ) : null}
      </div>
      {open ? (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor={`${ids}-label`} className="block text-sm">
              Week label
            </label>
            <select
              id={`${ids}-label`}
              className={field}
              value={label}
              onChange={(e) => setLabel(e.target.value as "W1" | "W2")}
            >
              <option value="W1">Week 1</option>
              <option value="W2">Week 2</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${ids}-note`} className="block text-sm">
              Note (optional)
            </label>
            <input
              id={`${ids}-note`}
              type="text"
              className={field}
              maxLength={MAX_TEXT}
              aria-describedby={`${ids}-hint`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <p id={`${ids}-hint`} className="text-sm text-muted-foreground">
              No student names
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            disabled={set.isPending}
            onClick={() =>
              set.mutate(
                { date, weekLabel: label, note },
                {
                  onSuccess: () => {
                    setOpen(false);
                    onDone(`${when}: now ${WEEK[label]}.`);
                  },
                },
              )
            }
          >
            Save week label
          </Button>
        </div>
      ) : null}
      {failure ? (
        <p role="alert" className="text-danger">
          {failure.message}
        </p>
      ) : null}
    </div>
  );
}
