import { useState } from "react";
import { ApiError } from "../../api/client.ts";
import { type Term, useSaveTerms, useTerms } from "../../api/queries.ts";
import { Button } from "../../components/ui/button.tsx";
import {
  EmptyState,
  ErrorState,
  Loading,
} from "../../components/ui/states.tsx";

const field = "rounded-md border border-border bg-card px-2 py-1";

function TermsForm({ initial }: { initial: Term[] }) {
  const [terms, setTerms] = useState(initial);
  const save = useSaveTerms();
  const set = (
    id: Term["id"],
    key: "firstPupilDay" | "lastPupilDay",
    v: string,
  ) =>
    setTerms((all) => all.map((t) => (t.id === id ? { ...t, [key]: v } : t)));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(terms);
      }}
    >
      <div className="mt-3 space-y-3">
        {terms.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-3">
            <span className="w-8 font-semibold">{t.id}</span>
            <label className="flex items-center gap-2">
              First pupil day
              <input
                type="date"
                aria-label={`${t.id} first pupil day`}
                value={t.firstPupilDay}
                onChange={(e) => set(t.id, "firstPupilDay", e.target.value)}
                className={field}
              />
            </label>
            <label className="flex items-center gap-2">
              Last pupil day
              <input
                type="date"
                aria-label={`${t.id} last pupil day`}
                value={t.lastPupilDay}
                onChange={(e) => set(t.id, "lastPupilDay", e.target.value)}
                className={field}
              />
            </label>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={save.isPending}>
          Save the terms
        </Button>
        {save.isSuccess ? <span role="status">Terms saved.</span> : null}
      </div>
      {save.isError ? (
        <div className="mt-3">
          <ErrorState
            title="The terms were not saved"
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
        </div>
      ) : null}
    </form>
  );
}

export function TermsCard() {
  const terms = useTerms();
  return (
    <section
      aria-labelledby="terms-title"
      className="rounded-lg border border-border bg-card p-4"
    >
      <h2 id="terms-title" className="text-xl font-semibold">
        Terms
      </h2>
      {terms.isPending ? <Loading what="the terms" /> : null}
      {terms.isError ? <ErrorState message={terms.error.message} /> : null}
      {terms.data && terms.data.length === 0 ? (
        <EmptyState title="No terms yet" />
      ) : null}
      {terms.data && terms.data.length > 0 ? (
        <TermsForm key={JSON.stringify(terms.data)} initial={terms.data} />
      ) : null}
    </section>
  );
}
