import { expect, test } from "vitest";
import { aiNote } from "./ai-note.ts";
import { aiProvenance, engineProvenance } from "./test-data.ts";

const aiSuggested = { provenance: aiProvenance("suggested") };
const aiAccepted = { provenance: aiProvenance("accepted") };
const aiRejected = { provenance: aiProvenance("rejected") };
const engineItem = { provenance: engineProvenance };

test("an unreviewed AI item is left out, with a warning that says how many", () => {
  expect(aiNote([], [aiSuggested]).warning).toBe(
    "1 AI suggestion was left out because you have not reviewed it.",
  );
  expect(aiNote([], [aiSuggested, aiSuggested]).warning).toBe(
    "2 AI suggestions were left out because you have not reviewed them.",
  );
});

test("a rejected AI item is counted in the warning as rejected, not as unreviewed", () => {
  expect(aiNote([], [aiRejected]).warning).toBe(
    "1 rejected AI suggestion was left out.",
  );
  expect(aiNote([], [aiSuggested, aiRejected, aiRejected]).warning).toBe(
    "1 AI suggestion was left out because you have not reviewed it. 2 rejected AI suggestions were left out.",
  );
});

test("reviewed AI items are named in a statement with the review date", () => {
  expect(aiNote([aiAccepted], []).statement).toMatch(
    /1 item was drafted by AI and reviewed on 2026-11-2\d/,
  );
  expect(aiNote([aiAccepted, aiAccepted], []).statement).toBe(
    "2 items were drafted by AI and reviewed on 2026-11-24.",
  );
});

test("a review date given with the item wins over the date of the AI run", () => {
  const edited = {
    provenance: aiProvenance("edited", "2026-11-20T09:00:00.000Z"),
    reviewedOn: "2026-11-25",
  };
  expect(aiNote([edited], []).statement).toBe(
    "1 item was drafted by AI and reviewed on 2026-11-25.",
  );
});

test("with no AI items there is no statement and no warning", () =>
  expect(aiNote([engineItem], [])).toEqual({ statement: null, warning: null }));

test("an engine item is never counted as AI, even among excluded ones", () =>
  expect(aiNote([engineItem], [engineItem])).toEqual({
    statement: null,
    warning: null,
  }));
