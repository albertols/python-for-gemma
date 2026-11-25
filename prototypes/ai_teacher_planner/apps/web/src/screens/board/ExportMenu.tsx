import { useEffect, useState } from "react";
import { useExportFortnight, useExportTeams } from "../../api/queries.ts";
import { Button } from "../../components/ui/button.tsx";
import { Disclosure } from "../../components/ui/disclosure.tsx";
import { longDate } from "../../lib/dates.ts";

const field =
  "rounded-md border border-border bg-card px-2 py-1.5 text-card-foreground";

/** What was left out, said before anything is saved or copied. */
function Warning({ text }: { text: string | null | undefined }) {
  return text ? (
    <p
      role="status"
      className="mt-2 rounded-md border border-dashed border-border p-2"
    >
      <strong>Left out: </strong>
      {text}
    </p>
  ) : null;
}

function FortnightExport({ w1 }: { w1: string | null }) {
  const run = useExportFortnight();
  const [url, setUrl] = useState<string | null>(null);
  const built = run.data;
  // The file lives in the page only; its link goes when the panel closes or a new one is built.
  useEffect(() => {
    if (!built) return;
    const made = URL.createObjectURL(built.blob);
    setUrl(made);
    return () => {
      URL.revokeObjectURL(made);
      setUrl(null);
    };
  }, [built]);
  return (
    <section aria-labelledby="export-xlsx">
      <h3 id="export-xlsx" className="font-semibold">
        Fortnight in Excel
      </h3>
      <p className="text-muted-foreground">
        Week 1 and Week 2 sheets laid out like your timetable.
      </p>
      <Button
        type="button"
        className="mt-2"
        disabled={w1 === null || run.isPending}
        onClick={() => w1 && run.mutate(w1)}
      >
        Prepare the Excel file
      </Button>
      {run.isError ? (
        <p role="alert" className="mt-2">
          {run.error.message}
        </p>
      ) : null}
      {built ? (
        <>
          <Warning text={built.warning} />
          <p role="status" className="mt-2">
            {built.warning ? "Ready, without those items. " : "Ready. "}
            {url ? (
              <a
                href={url}
                download={built.fileName}
                className="font-medium underline"
              >
                Save {built.fileName}
              </a>
            ) : null}
          </p>
        </>
      ) : null}
    </section>
  );
}

function TeamsExport({
  groups,
  weeks,
  firstGroup,
}: {
  groups: readonly string[];
  weeks: readonly string[];
  firstGroup: string | null;
}) {
  const run = useExportTeams();
  const [groupId, setGroupId] = useState(firstGroup ?? groups[0] ?? "");
  const [weekOf, setWeekOf] = useState(weeks[0] ?? "");
  const [copied, setCopied] = useState<string | null>(null);
  const post = run.data;
  const copy = async () => {
    if (!post) return;
    try {
      await navigator.clipboard.writeText(post.text);
      setCopied("Copied.");
    } catch {
      setCopied("Copying is not allowed here. Select the text and copy it.");
    }
  };
  return (
    <section aria-labelledby="export-teams" className="mt-4">
      <h3 id="export-teams" className="font-semibold">
        Post for Teams
      </h3>
      <p className="text-muted-foreground">
        One group's week as plain text to paste into a post.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <label className="flex flex-col">
          Group
          <select
            className={field}
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            {groups.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          Week of
          <select
            className={field}
            value={weekOf}
            onChange={(e) => setWeekOf(e.target.value)}
          >
            {weeks.map((w) => (
              <option key={w} value={w}>
                {longDate(w)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Button
        type="button"
        className="mt-2"
        disabled={!groupId || !weekOf || run.isPending}
        onClick={() => {
          setCopied(null);
          run.mutate({ groupId, weekOf });
        }}
      >
        Write the post
      </Button>
      {run.isError ? (
        <p role="alert" className="mt-2">
          {run.error.message}
        </p>
      ) : null}
      {post ? (
        <>
          <Warning text={post.warning} />
          <label className="mt-2 flex flex-col">
            The post
            <textarea
              readOnly
              rows={Math.min(10, post.text.split("\n").length + 1)}
              className={`${field} font-mono`}
              value={post.text}
            />
          </label>
          <Button type="button" className="mt-2" onClick={() => void copy()}>
            Copy the text
          </Button>
          {copied ? (
            <p role="status" className="mt-2">
              {copied}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

/**
 * The board's Export menu: the fortnight as an Excel file, or one group's week
 * as text for Teams. Both say what was left out (AI suggestions she has not
 * reviewed) before anything is saved or copied.
 */
export function ExportMenu({
  w1,
  weeks,
  groups,
  firstGroup,
}: {
  /** The shown fortnight's first Monday, or null when none is shown. */
  w1: string | null;
  /** The Mondays of the shown fortnight, the shown week first. */
  weeks: readonly string[];
  groups: readonly string[];
  /** The group the board is filtered to, when it is filtered to one. */
  firstGroup: string | null;
}) {
  return (
    <Disclosure
      label="Export"
      buttonClassName="px-3 py-2"
      panelClassName="w-96"
    >
      <FortnightExport w1={w1} />
      <TeamsExport groups={groups} weeks={weeks} firstGroup={firstGroup} />
    </Disclosure>
  );
}
