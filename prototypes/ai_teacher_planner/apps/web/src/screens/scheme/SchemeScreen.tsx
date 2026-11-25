import type {
  CurriculumPack,
  GroupOverride,
  PlanInputs,
  SowItem,
} from "@planner/domain";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { ApiError } from "../../api/client.ts";
import {
  type AiItemView,
  type AiRunView,
  provenanceOf,
  useAiItems,
  useAiRuns,
  useJob,
  useReviewItem,
} from "../../api/jobs.ts";
import {
  type CourseRow,
  type ImportPreview,
  invalidateScheme,
  type SchemeData,
  useConfig,
  useCourses,
  usePack,
  usePlanInputs,
  useSaveScheme,
  useScheme,
  useSetRevisionWeeks,
  useSuggestCounts,
  useTimetable,
} from "../../api/queries.ts";
import { EditCount } from "../../components/ActivityDrawer.tsx";
import { AiBadge, aiOutline } from "../../components/AiBadge.tsx";
import { PlanArea } from "../../components/PlanNotices.tsx";
import { ProvenancePopover } from "../../components/ProvenancePopover.tsx";
import { ReviewBar } from "../../components/ReviewBar.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
  EmptyState,
  ErrorState,
  Loading,
} from "../../components/ui/states.tsx";
import { ImportSchemeDialog } from "./ImportSchemeDialog.tsx";
import { SchemeTable } from "./SchemeTable.tsx";
import { SchemeTotals } from "./SchemeTotals.tsx";
import {
  addItem,
  askedStatus,
  differenceText,
  lessonsPerFortnight,
  suggestionOf,
  totalsPerGroup,
  withEdits,
} from "./scheme-model.ts";

const FIELD =
  "rounded-md border border-border bg-background px-2 py-1 text-foreground";
const KINDS = [
  ["teaching", "Chapter"],
  ["project", "Project"],
  ["revision", "Revision"],
  ["buffer", "Buffer"],
  ["assessment", "Assessment"],
] as const;

const messageOf = (error: unknown) =>
  error instanceof ApiError
    ? error.message
    : "The planner could not be reached.";

/** The number of weeks of revision before the exam. It is saved on its own, as part of the course. */
function RevisionWeeks({ course }: { course: CourseRow }) {
  const save = useSetRevisionWeeks(course.id);
  const [text, setText] = useState(String(course.revisionWeeks));
  const n = Number(text);
  const valid = text.trim() !== "" && Number.isInteger(n) && n >= 0;
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save.mutate(n);
      }}
    >
      <label className="flex flex-col text-sm">
        Weeks of revision before the exam
        <input
          type="number"
          min={0}
          step={1}
          value={text}
          className={`${FIELD} w-24`}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <Button
        type="submit"
        disabled={!valid || n === course.revisionWeeks || save.isPending}
      >
        Save revision weeks
      </Button>
      {save.error ? (
        <span role="alert" className="text-danger">
          {messageOf(save.error)}
        </span>
      ) : null}
    </form>
  );
}

/** The AI's suggestion for one chapter, under her own number: a difference she accepts, edits or rejects. */
function SuggestionRow({
  item,
  run,
  title,
  columns,
  locked,
  timeZone,
  onReviewed,
}: {
  item: AiItemView;
  run: AiRunView | undefined;
  title: string;
  columns: number;
  /** Her unsaved edits would be mixed up with the stored scheme the review changes. */
  locked: boolean;
  timeZone: string;
  onReviewed: () => void;
}) {
  const review = useReviewItem();
  const [editing, setEditing] = useState(false);
  const s = suggestionOf(item);
  if (!s) return null;
  const decide = (state: "accepted" | "rejected") =>
    review.mutate({ id: item.id, state }, { onSuccess: onReviewed });
  return (
    <tr aria-label={`Suggestion for ${title}`}>
      <td colSpan={columns} className="p-2">
        <div className={`rounded-lg p-3 ${aiOutline(item.review)}`}>
          <div className="flex flex-wrap items-center gap-2">
            <AiBadge review={item.review} />
            <p>
              <strong>{title}</strong>:{" "}
              <span className="font-semibold">
                {differenceText(s.from, s.to)}
              </span>{" "}
              lessons
              {s.tricky ? " (the AI marked this as tricky)" : ""}
            </p>
            {run ? (
              <ProvenancePopover
                provenance={provenanceOf(run, item)}
                timeZone={timeZone}
              />
            ) : null}
          </div>
          {s.reason ? (
            <p className="mt-1 text-muted-foreground">{s.reason}</p>
          ) : null}
          {editing ? (
            <EditCount
              item={item}
              onCancel={() => setEditing(false)}
              onSave={(data) =>
                review.mutate(
                  { id: item.id, state: "edited", data },
                  {
                    onSuccess: () => {
                      setEditing(false);
                      onReviewed();
                    },
                  },
                )
              }
            />
          ) : (
            <ReviewBar
              item={item}
              busy={locked || review.isPending}
              onAccept={() => decide("accepted")}
              onEdit={() => setEditing(true)}
              onReject={() => decide("rejected")}
            />
          )}
          {locked ? (
            <p className="mt-1 text-muted-foreground">
              Save or discard your changes before you review this.
            </p>
          ) : null}
          {review.error ? (
            <p role="alert" className="mt-2 text-danger">
              {review.error.message}
            </p>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function SchemeEditor({
  course,
  scheme,
  inputs,
  pack,
  perFortnight,
}: {
  course: CourseRow;
  scheme: SchemeData;
  inputs: PlanInputs;
  pack: CurriculumPack;
  perFortnight: Record<string, number>;
}) {
  const qc = useQueryClient();
  const config = useConfig();
  const timeZone = config.data?.timeZone ?? "UTC";
  const [draft, setDraft] = useState<{
    items: SowItem[];
    overrides: GroupOverride[];
  } | null>(null);
  const items = draft?.items ?? (scheme.items as SowItem[]);
  const overrides = draft?.overrides ?? (scheme.overrides as GroupOverride[]);
  const dirty = draft !== null;
  const edit = (patch: { items?: SowItem[]; overrides?: GroupOverride[] }) =>
    setDraft({ items, overrides, ...patch });

  const totals = useMemo(
    () => totalsPerGroup(withEdits(inputs, items, overrides), perFortnight),
    [inputs, items, overrides, perFortnight],
  );
  const groupIds = totals.map((t) => t.groupId);

  const save = useSaveScheme(course.id);
  const [importing, setImporting] = useState(false);
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("teaching");

  const suggest = useSuggestCounts(course.id);
  const [runId, setRunId] = useState<string | null>(null);
  const job = useJob(runId);
  const aiItems = useAiItems();
  const runs = useAiRuns();
  const waiting = (aiItems.data ?? []).filter(
    (i) =>
      i.kind === "lesson-count" &&
      i.courseId === course.id &&
      i.review === "suggested",
  );
  const asking = suggest.isPending || (runId !== null && !job.ended);
  const asked = askedStatus(job.run);

  const onAccept = (preview: ImportPreview) =>
    save.mutate(
      {
        items: preview.items,
        // a group's own count for an item the sheet no longer has would be refused
        overrides: overrides.filter((o) =>
          preview.items.some((i) => i.id === o.itemId),
        ),
      },
      {
        onSuccess: () => {
          setDraft(null);
          setImporting(false);
        },
      },
    );

  const suggestionFor = (item: SowItem): ReactNode =>
    waiting
      .filter((w) => w.target === item.id)
      .map((mine) => (
        <SuggestionRow
          key={mine.id}
          item={mine}
          run={runs.data?.find((r) => r.id === mine.runId)}
          title={item.title}
          columns={groupIds.length + 5}
          locked={dirty}
          timeZone={timeZone}
          onReviewed={() => invalidateScheme(qc, course.id)}
        />
      ));

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <RevisionWeeks key={course.revisionWeeks} course={course} />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={dirty || asking}
            onClick={() =>
              suggest.mutate(undefined, { onSuccess: (r) => setRunId(r.id) })
            }
          >
            Suggest lesson counts
          </Button>
          <Button
            type="button"
            disabled={dirty}
            onClick={() => setImporting(true)}
          >
            Import from my planning sheet
          </Button>
        </div>
      </div>
      {dirty ? (
        <p className="text-sm text-muted-foreground">
          Suggestions and the import work on the saved scheme. Save or discard
          your changes first.
        </p>
      ) : null}
      {suggest.error ? (
        <p role="alert" className="font-medium text-danger">
          {messageOf(suggest.error)}
        </p>
      ) : null}
      <div role="status">
        {asking ? (
          <p>Asking for lesson counts{job.note ? `: ${job.note}` : "..."}</p>
        ) : asked ? (
          <p className={asked.problem ? "text-danger" : undefined}>
            {asked.text}
          </p>
        ) : null}
      </div>

      <SchemeTotals totals={totals} />

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-sm">
          Kind of item to add
          <select
            value={kind}
            className={FIELD}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            {KINDS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          onClick={() => edit({ items: addItem(items, course.id, kind) })}
        >
          Add item
        </Button>
        <span className="flex-1" />
        {dirty ? (
          <>
            <p role="status" className="font-medium">
              You have unsaved changes.
            </p>
            <Button type="button" onClick={() => setDraft(null)}>
              Discard changes
            </Button>
          </>
        ) : null}
        <Button
          type="button"
          variant="primary"
          disabled={!dirty || save.isPending}
          onClick={() =>
            save.mutate(
              { items, overrides },
              { onSuccess: () => setDraft(null) },
            )
          }
        >
          Save scheme
        </Button>
      </div>
      {save.error && !importing ? (
        <ErrorState
          title="The scheme was not saved"
          message={messageOf(save.error)}
        >
          {save.error instanceof ApiError && save.error.issues.length > 0 ? (
            <ul className="mt-2 list-disc pl-5">
              {save.error.issues.map((issue, n) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: the same sentence can be listed twice
                <li key={`${n}-${issue}`}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </ErrorState>
      ) : null}

      <SchemeTable
        items={items}
        overrides={overrides}
        groupIds={groupIds}
        perFortnight={perFortnight}
        pack={pack}
        standing={{
          pins: inputs.pins,
          merges: inputs.merges,
          positions: inputs.positions,
        }}
        onItems={(next) => edit({ items: next })}
        onOverrides={(next) => edit({ overrides: next })}
        suggestionFor={suggestionFor}
      />
      {importing ? (
        <ImportSchemeDialog
          courseId={course.id}
          saving={save.isPending}
          failure={save.error ? messageOf(save.error) : null}
          onAccept={onAccept}
          onClose={() => setImporting(false)}
        />
      ) : null}
    </div>
  );
}

/** The version of the timetable in force on `today`, or the latest one. */
function currentVersion<T extends { validFrom: string }>(
  versions: T[],
  today: string,
): T | undefined {
  const sorted = [...versions].sort((a, b) =>
    a.validFrom < b.validFrom ? -1 : 1,
  );
  return sorted.filter((v) => v.validFrom <= today).at(-1) ?? sorted.at(-1);
}

/** One course's scheme of work: her items, live totals, import and the AI's suggestions. */
export function SchemeScreen() {
  const { courseId = "" } = useParams();
  const courses = useCourses();
  const course = courses.data?.find((c) => c.id === courseId);
  const locked = course?.pack === "locked";
  const scheme = useScheme(courseId, locked);
  const inputs = usePlanInputs(courseId, locked);
  const pack = usePack(courseId);
  const timetable = useTimetable();

  const perFortnight = useMemo(() => {
    const version = currentVersion(
      timetable.data?.versions ?? [],
      inputs.data?.today ?? "",
    );
    return version ? lessonsPerFortnight(version) : {};
  }, [timetable.data, inputs.data?.today]);

  let body: ReactNode;
  const failed = courses.error ?? scheme.error ?? inputs.error ?? pack.error;
  if (failed)
    body = (
      <ErrorState
        title="This scheme cannot be shown"
        message={messageOf(failed)}
      />
    );
  else if (!courses.data) body = <Loading what="the course" />;
  else if (!course)
    body = (
      <ErrorState title="No such course" message="There is no such course." />
    );
  else if (!locked)
    body = (
      <EmptyState title="The curriculum pack is not locked yet">
        The scheme of work is built on a locked pack.{" "}
        <Link
          to={`/setup/courses/${course.id}/pack`}
          className="text-link underline"
        >
          Review the pack
        </Link>
      </EmptyState>
    );
  else if (!scheme.data || !inputs.data || !pack.data || !timetable.data)
    body = <Loading what="the scheme" />;
  else if (!pack.data.locked) body = <Loading what="the pack" />;
  else
    body = (
      <SchemeEditor
        // a different course starts from its own stored scheme
        key={course.id}
        course={course}
        scheme={scheme.data}
        inputs={inputs.data}
        pack={pack.data.locked}
        perFortnight={perFortnight}
      />
    );

  return (
    <section aria-labelledby="scheme-title">
      <h1 id="scheme-title" className="text-2xl font-semibold">
        Scheme of work{course ? `: ${course.title}` : ""}
      </h1>
      {course ? (
        <div className="mt-4">
          <PlanArea only={course.id} />
        </div>
      ) : null}
      {body}
    </section>
  );
}

/** Her courses, each with a way in to its scheme. */
export function SchemeCourses() {
  const courses = useCourses();
  return (
    <section aria-labelledby="scheme-courses-title">
      <h1 id="scheme-courses-title" className="text-2xl font-semibold">
        Scheme of work
      </h1>
      {courses.error ? (
        <div className="mt-6">
          <ErrorState message="The courses could not be loaded." />
        </div>
      ) : !courses.data ? (
        <div className="mt-6">
          <Loading what="the courses" />
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {courses.data.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1"
            >
              <span className="font-medium">{c.title}</span>
              {c.pack === "locked" ? (
                <Link to={`/scheme/${c.id}`} className="text-link underline">
                  Open scheme of work
                  <span className="sr-only"> for {c.title}</span>
                </Link>
              ) : (
                <span className="text-muted-foreground">
                  Lock the curriculum pack first.
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
