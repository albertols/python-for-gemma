import type { Provenance } from "@planner/domain";
import { whenOf } from "../lib/dates.ts";
import { Disclosure } from "./ui/disclosure.tsx";

/**
 * A source is a link only when it is an https address. Its text always shows the real host,
 * so a title the model chose cannot pass one site off as another.
 */
function sourceLink(url: string): { host: string } | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? { host: u.host } : null;
  } catch {
    return null;
  }
}

/** Who made an AI item and from what: provider, model, skill, time and sources. Engine output has none. */
export function ProvenancePopover({
  provenance,
  timeZone,
  defaultOpen = false,
}: {
  provenance: Provenance;
  timeZone: string;
  defaultOpen?: boolean;
}) {
  const ai = provenance.ai;
  if (provenance.origin !== "ai" || !ai) return null;
  return (
    <Disclosure
      label="Where this came from"
      defaultOpen={defaultOpen}
      panelClassName="text-left !left-auto right-0"
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Provider</dt>
        <dd>{ai.provider}</dd>
        <dt className="text-muted-foreground">Model</dt>
        <dd>{ai.model}</dd>
        <dt className="text-muted-foreground">Skill</dt>
        <dd className="break-all">{ai.skillId}</dd>
        <dt className="text-muted-foreground">Time</dt>
        <dd>{whenOf(ai.at, timeZone)}</dd>
      </dl>
      <h3 className="mt-3 font-semibold">Sources</h3>
      {ai.sources.length === 0 ? (
        <p className="text-muted-foreground">No sources.</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {ai.sources.map((s) => {
            const link = sourceLink(s.url);
            return (
              <li key={s.url}>
                {link ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={`${s.title ?? link.host} — ${s.url}`}
                    className="break-all text-link underline"
                  >
                    {s.title ? `${s.title} — ${link.host}` : link.host}
                  </a>
                ) : (
                  <span className="break-all">
                    {s.title ?? s.url} (not a secure link)
                  </span>
                )}{" "}
                <span className="text-muted-foreground">
                  ({s.opened ? "opened" : "not opened"})
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Disclosure>
  );
}
