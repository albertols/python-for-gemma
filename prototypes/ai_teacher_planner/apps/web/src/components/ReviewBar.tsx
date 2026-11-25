import type { ReviewState } from "@planner/domain";
import { Button } from "./ui/button.tsx";

/** Her three choices on a suggestion. Once she has chosen, there is nothing left to show. */
export function ReviewBar({
  item,
  onAccept,
  onEdit,
  onReject,
  busy = false,
}: {
  item: { id: string; review: ReviewState };
  onAccept: () => void;
  /** Left out for a kind of item that has nothing she can change yet. */
  onEdit?: () => void;
  onReject: () => void;
  busy?: boolean;
}) {
  if (item.review !== "suggested") return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <Button
        type="button"
        variant="primary"
        disabled={busy}
        onClick={onAccept}
      >
        Accept
      </Button>
      {onEdit ? (
        <Button type="button" disabled={busy} onClick={onEdit}>
          Edit
        </Button>
      ) : null}
      <Button type="button" disabled={busy} onClick={onReject}>
        Reject
      </Button>
    </div>
  );
}
