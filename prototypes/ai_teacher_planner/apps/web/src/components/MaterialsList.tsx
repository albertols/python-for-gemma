import { useId, useRef } from "react";
import {
  type MaterialData,
  useAttachMaterial,
  useRemoveMaterial,
} from "../api/queries.ts";
import { Button } from "./ui/button.tsx";

/** "12 KB", "1.4 MB". */
export function sizeWords(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ACCEPT = ".pptx,.docx,.xlsx,.pdf,.png,.jpg";

/**
 * The files attached to one lesson, each with Remove, and "Attach a file". A
 * file's name is her own text, so it is only ever a text node here. The API
 * checks the type and the size; the `accept` list only helps her choose.
 */
export function MaterialsList({
  groupId,
  lessonId,
  materials,
}: {
  groupId: string;
  lessonId: string;
  materials: MaterialData[];
}) {
  const ids = useId();
  const input = useRef<HTMLInputElement>(null);
  const attach = useAttachMaterial(groupId, lessonId);
  const remove = useRemoveMaterial();
  return (
    <div className="mt-4">
      <h4 id={`${ids}-title`} className="font-semibold">
        Materials
      </h4>
      {materials.length === 0 ? (
        <p className="mt-1 text-muted-foreground">Nothing attached yet.</p>
      ) : (
        <ul aria-labelledby={`${ids}-title`} className="mt-1 space-y-1">
          {materials.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2">
              <a
                className="break-all underline underline-offset-2"
                href={`/api/materials/${m.id}`}
                download
              >
                {m.name}
              </a>
              <span className="text-sm text-muted-foreground">
                {sizeWords(m.size)}
              </span>
              <Button
                type="button"
                aria-label={`Remove ${m.name}`}
                disabled={remove.isPending}
                onClick={() => {
                  attach.reset();
                  remove.mutate(m.id);
                }}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2">
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-card-foreground hover:bg-muted focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
          Attach a file
          <input
            ref={input}
            type="file"
            className="sr-only"
            accept={ACCEPT}
            aria-describedby={`${ids}-hint`}
            disabled={attach.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              remove.reset();
              if (file) attach.mutate(file);
              // the same file can be chosen again after a refusal
              e.target.value = "";
            }}
          />
        </label>
        <p id={`${ids}-hint`} className="mt-1 text-sm text-muted-foreground">
          Word, Excel, PowerPoint, PDF, PNG or JPG, up to 25 MB. No student
          names in file names.
        </p>
      </div>
      {attach.isPending ? (
        <p role="status" className="mt-1">
          Attaching...
        </p>
      ) : null}
      {attach.isError ? (
        <p role="alert" className="mt-1 text-danger">
          {attach.error.message}
        </p>
      ) : null}
      {remove.isError ? (
        <p role="alert" className="mt-1 text-danger">
          {remove.error.message}
        </p>
      ) : null}
    </div>
  );
}
