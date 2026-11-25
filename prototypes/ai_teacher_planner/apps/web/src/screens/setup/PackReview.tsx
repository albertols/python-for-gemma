import type { CurriculumPack, Provenance } from "@planner/domain";
import { type ReactNode, useState } from "react";
import { Link, useParams } from "react-router";
import { ApiError } from "../../api/client.ts";
import {
  type PackReviewNotes,
  useConfig,
  useCourses,
  useLockPack,
  usePack,
  useSaveDraftPack,
} from "../../api/queries.ts";
import { AiBadge } from "../../components/AiBadge.tsx";
import { ProvenancePopover } from "../../components/ProvenancePopover.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
  EmptyState,
  ErrorState,
  Loading,
} from "../../components/ui/states.tsx";
import { whenOf } from "../../lib/dates.ts";
import { lockBlockers } from "../../lib/pack-review.ts";
import { PackTree } from "./PackTree.tsx";

/** The run that made the draft, as the provenance the AI mark and its popover show. */
function draftProvenance(
  meta: NonNullable<PackReviewNotes["meta"]>,
): Provenance {
  return {
    origin: "ai",
    ai: {
      runId: "pack-draft",
      provider: meta.provider,
      model: meta.model,
      skillId: meta.skillId,
      at: meta.startedAt,
      sources: meta.sources,
      review: "suggested",
    },
  };
}

function AiNotes({
  review,
  timeZone,
}: {
  review: PackReviewNotes | null;
  timeZone: string;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-dashed border-ai p-3"
    >
      <AiBadge review="suggested" />
      <p>Drafted by AI and not yet reviewed. Locking it is your review.</p>
      {review?.meta ? (
        <ProvenancePopover
          provenance={draftProvenance(review.meta)}
          timeZone={timeZone}
        />
      ) : null}
    </div>
  );
}

function Doubts({ review }: { review: PackReviewNotes }) {
  if (review.unsure.length === 0) return null;
  return (
    <section
      aria-label="Where the AI was unsure"
      className="rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-lg font-semibold">Where the AI was unsure</h2>
      <ul className="mt-2 space-y-2">
        {review.unsure.map((u) => (
          <li key={`${u.about}|${u.note}`}>
            <AiBadge review="suggested" /> <strong>{u.about}:</strong> {u.note}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Draft({
  courseId,
  draft,
  review,
  timeZone,
}: {
  courseId: string;
  draft: CurriculumPack;
  review: PackReviewNotes | null;
  timeZone: string;
}) {
  const save = useSaveDraftPack(courseId);
  const lock = useLockPack(courseId);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const blockers = lockBlockers(draft, checked);
  const failure = save.error ?? lock.error;
  return (
    <div className="mt-6 space-y-6">
      <AiNotes review={review} timeZone={timeZone} />
      {review ? <Doubts review={review} /> : null}
      <section
        aria-label="Before the pack can be locked"
        className="rounded-lg border border-border bg-card p-4"
      >
        <h2 className="text-lg font-semibold">Before the pack can be locked</h2>
        {blockers.length === 0 ? (
          <p className="mt-2">Nothing is left. You can lock the pack.</p>
        ) : (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
        <Button
          type="button"
          variant="primary"
          className="mt-3"
          disabled={blockers.length > 0 || lock.isPending || save.isPending}
          onClick={() => lock.mutate()}
        >
          Lock
        </Button>
      </section>
      {failure ? (
        <ErrorState
          title="That did not work"
          message={failure instanceof ApiError ? failure.message : "Try again."}
        >
          {failure instanceof ApiError && failure.issues.length > 0 ? (
            <ul className="mt-2 list-disc pl-5">
              {failure.issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          ) : null}
        </ErrorState>
      ) : null}
      <PackTree
        pack={draft}
        review={review}
        readOnly={false}
        busy={save.isPending || lock.isPending}
        checked={checked}
        onCheck={(unitId, on) =>
          setChecked((was) => {
            const next = new Set(was);
            if (on) next.add(unitId);
            else next.delete(unitId);
            return next;
          })
        }
        onChange={(pack) => {
          lock.reset();
          save.mutate(pack);
        }}
      />
    </div>
  );
}

/** One course's pack: the draft to correct and lock, or the locked pack to read. */
export function PackReview() {
  const { courseId = "" } = useParams();
  const courses = useCourses();
  const pack = usePack(courseId);
  const config = useConfig();
  const timeZone = config.data?.timeZone ?? "UTC";
  const course = courses.data?.find((c) => c.id === courseId);

  let body: ReactNode;
  if (pack.error)
    body = (
      <ErrorState
        title="This pack cannot be shown"
        message={
          pack.error instanceof ApiError
            ? pack.error.message
            : "The planner could not be reached."
        }
      />
    );
  else if (!pack.data) body = <Loading what="the pack" />;
  else if (pack.data.locked)
    body = (
      <div className="mt-6 space-y-6">
        <p
          role="status"
          className="rounded-lg border border-border bg-card p-3"
        >
          {pack.data.locked.lockedAt
            ? `Locked on ${whenOf(pack.data.locked.lockedAt, timeZone)}.`
            : "Locked."}{" "}
          This pack is read-only.
        </p>
        <PackTree
          pack={pack.data.locked}
          review={null}
          readOnly
          busy={false}
          checked={new Set()}
          onCheck={() => {}}
          onChange={() => {}}
        />
      </div>
    );
  else if (pack.data.draft)
    body = (
      <Draft
        courseId={courseId}
        draft={pack.data.draft}
        review={pack.data.review}
        timeZone={timeZone}
      />
    );
  else
    body = (
      <div className="mt-6">
        <EmptyState title="There is no pack for this course yet">
          A pack is drafted from the exam board's specification with{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            pnpm pack:draft
          </code>
          . It will appear here for you to review.
        </EmptyState>
      </div>
    );

  return (
    <section aria-labelledby="pack-title">
      <p>
        <Link to="/setup/courses" className="text-link underline">
          All curriculum packs
        </Link>
      </p>
      <h1 id="pack-title" className="mt-2 text-2xl font-semibold">
        Curriculum pack{course ? `: ${course.title}` : ""}
      </h1>
      {body}
    </section>
  );
}
