import type { ReviewState } from "@planner/domain";
import { cn } from "../lib/utils.ts";

/** What a screen reader hears for each state. The words are the meaning; the colour only helps. */
export const AI_REVIEW_TEXT: Record<ReviewState, string> = {
  suggested: "AI suggestion, not reviewed",
  accepted: "AI suggestion, accepted",
  edited: "AI suggestion, edited by you",
  rejected: "AI suggestion, rejected",
};

/** The outline of a card holding AI content: dashed while it awaits her review, solid after. */
export function aiOutline(review: ReviewState): string {
  return review === "suggested"
    ? "border-2 border-dashed border-ai"
    : "border border-solid border-border";
}

function Sparkle({ size }: { size: number }) {
  return (
    <svg
      data-mark="sparkle"
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 1.5l2.6 7.9 7.9 2.6-7.9 2.6L12 22.5l-2.6-7.9L1.5 12l7.9-2.6z" />
    </svg>
  );
}

function Pencil() {
  return (
    <svg
      data-mark="pencil"
      aria-hidden="true"
      focusable="false"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="M4 20l1-5L16.5 3.5a2.1 2.1 0 013 3L8 18z" />
    </svg>
  );
}

function Strike() {
  return (
    <svg
      data-mark="strike"
      aria-hidden="true"
      focusable="false"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    >
      <path d="M3 21L21 3" />
    </svg>
  );
}

/**
 * The AI mark. Awaiting review: a sparkle with a dashed outline. Accepted: a small sparkle.
 * Edited by her: a sparkle and a pencil. Engine output never gets one.
 */
export function AiBadge({ review }: { review: ReviewState }) {
  const text = AI_REVIEW_TEXT[review];
  return (
    <span
      role="img"
      aria-label={text}
      title={text}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 align-middle text-ai",
        review === "suggested" && "border border-dashed border-ai",
      )}
    >
      <Sparkle size={review === "accepted" ? 12 : 16} />
      {review === "edited" ? <Pencil /> : null}
      {review === "rejected" ? <Strike /> : null}
    </span>
  );
}
