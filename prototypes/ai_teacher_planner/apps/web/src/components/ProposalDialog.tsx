import {
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { ApiError } from "../api/client.ts";
import {
  type PlanProposal,
  useAcceptPlan,
  useProposePlan,
  useScheme,
} from "../api/queries.ts";
import { type LessonNames, namesFrom, ProposalDiff } from "./ProposalDiff.tsx";
import { Button } from "./ui/button.tsx";

const STALE = "The plan changed while this was open. Nothing was applied.";

/** The planner's own words for a refusal, or that it could not be reached. */
function messageOf(error: unknown): string {
  if (error instanceof ApiError)
    return [error.message, ...error.issues].join(" ");
  return "The planner could not be reached.";
}

/**
 * A proposed change to a plan, shown before anything is stored: she accepts it
 * or cancels. The browser's own modal <dialog> keeps Tab inside it and closes
 * on Escape (which is Cancel). If the accept was refused because the plan
 * changed meanwhile, it says so and offers the new proposal.
 */
export function ProposalDialog({
  proposal,
  names,
  onAccept,
  onCancel,
  busy = false,
  accepting = false,
  stale = false,
  error = null,
  onRecompute,
}: {
  /** Null while the proposal is being worked out. */
  proposal: PlanProposal | null;
  names: LessonNames;
  onAccept: () => void;
  onCancel: () => void;
  busy?: boolean;
  /** The accept is on its way: the dialog stays until the planner answers, so its result is never lost. */
  accepting?: boolean;
  /** The accept was refused: the plan changed after this proposal was made. */
  stale?: boolean;
  /** Why the proposal could not be made or accepted, other than staleness. */
  error?: string | null;
  onRecompute?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  let body: ReactNode;
  if (proposal) body = <ProposalDiff proposal={proposal} names={names} />;
  else if (!error) body = <p>Working out the proposal...</p>;
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        // Escape is Cancel: the parent closes the dialog and puts the focus back
        e.preventDefault();
        if (!accepting) onCancel();
      }}
      className="m-auto max-h-[90vh] w-[min(48rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-border bg-card p-6 text-card-foreground backdrop:bg-black/60"
    >
      <h2 id={titleId} className="text-xl font-semibold">
        Proposal: {proposal?.label ?? "a new plan"}
      </h2>
      <p className="mt-1 text-muted-foreground">
        Nothing changes until you accept.
      </p>
      {stale ? (
        <div className="mt-4 rounded-md border-l-4 border-danger bg-muted p-3">
          <p role="alert" className="font-medium">
            {STALE}
          </p>
          {onRecompute ? (
            <Button
              type="button"
              className="mt-2"
              disabled={busy}
              onClick={onRecompute}
            >
              Show the new proposal
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-4">{body}</div>
      <div className="mt-6 flex gap-3">
        <Button
          type="button"
          variant="primary"
          disabled={!proposal || busy || stale}
          onClick={onAccept}
        >
          Accept
        </Button>
        <Button type="button" disabled={accepting} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </dialog>
  );
}

/**
 * A button that asks for a proposal for one course and shows it in the
 * dialog. Accept stores exactly the proposal she saw (the planner refuses it
 * if anything changed meanwhile); Cancel stores nothing. Either way the focus
 * goes back to the button.
 */
export function ProposeButton({
  courseId,
  children,
  disabled = false,
  onAccepted,
}: {
  courseId: string;
  children: ReactNode;
  disabled?: boolean;
  /** After a stored proposal, with its label. The caller says so and moves the focus (the button may be gone). */
  onAccepted?: ((label: string) => void) | undefined;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const propose = useProposePlan(courseId);
  const accept = useAcceptPlan(courseId);
  const scheme = useScheme(courseId, open);
  const names = useMemo(
    () => namesFrom(scheme.data?.items ?? [], scheme.data?.overrides ?? []),
    [scheme.data],
  );
  // The page behind the dialog is inert while it is open, so the focus goes
  // back to the button once the dialog has gone.
  const returnFocus = useRef(false);
  useEffect(() => {
    if (!open && returnFocus.current) {
      returnFocus.current = false;
      button.current?.focus();
    }
  }, [open]);
  const ask = () => {
    accept.reset();
    propose.mutate();
    // the lessons are named from the scheme as it is now, which may have changed meanwhile
    if (open) void scheme.refetch();
  };
  /** After Cancel the focus goes back to the button; after an accept the caller says what happened and takes it. */
  const close = (back = true) => {
    returnFocus.current = back || !onAccepted;
    setOpen(false);
    propose.reset();
    accept.reset();
  };
  const stale =
    accept.error instanceof ApiError && accept.error.code === "stale-proposal";
  const failure = propose.error ?? (stale ? null : accept.error);
  const proposal = propose.data ?? null;
  return (
    <>
      <Button
        ref={button}
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen(true);
          ask();
        }}
      >
        {children}
      </Button>
      {open ? (
        <ProposalDialog
          proposal={proposal}
          names={names}
          busy={propose.isPending || accept.isPending}
          accepting={accept.isPending}
          stale={stale}
          error={failure ? messageOf(failure) : null}
          onRecompute={ask}
          onCancel={() => close()}
          onAccept={() => {
            if (!proposal) return;
            accept.mutate(proposal, {
              onSuccess: () => {
                close(false);
                onAccepted?.(proposal.label);
              },
            });
          }}
        />
      ) : null}
    </>
  );
}
