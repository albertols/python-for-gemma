import { Readable } from "node:stream";
import { createRoute, z } from "@hono/zod-openapi";
import type { MaterialStore } from "../materials/store.ts";
import { receiveUpload } from "../materials/upload.ts";
import type { Repos } from "../repos/ports.ts";
import {
  attachMaterial,
  checkedLesson,
  findMaterial,
  readNote,
  removedFromPlan,
  summary,
  writeNote,
} from "../usecases/lesson-notes.ts";
import { guard } from "./require-access.ts";
import { createRouter } from "./router.ts";
import { errorResponse } from "./schemas.ts";

const json = <T extends z.ZodType>(schema: T) => ({
  "application/json": { schema },
});

const material = z.object({
  id: z.string(),
  name: z.string(),
  contentType: z.string(),
  size: z.number().int(),
  createdAt: z.string(),
});
const note = z.object({
  groupId: z.string(),
  lessonId: z.string(),
  text: z.string(),
  materials: z.array(material),
});
/** A `#` or a space in an id is not safe in a path, so the lesson is named in the query. */
const lessonQuery = z.object({
  groupId: z.string().min(1),
  lessonId: z.string().min(1),
});
const params = z.object({ id: z.string() });

const read = createRoute({
  method: "get",
  path: "/api/lesson-notes",
  request: { query: lessonQuery },
  responses: {
    200: {
      description:
        "Her plan and files for one content lesson (empty when there are none)",
      content: json(note),
    },
    404: errorResponse("There is no such group"),
    422: errorResponse("The id is a spare lesson's, or not a lesson's"),
  },
});
const write = createRoute({
  method: "put",
  path: "/api/lesson-notes",
  ...guard("lesson-plans", "edit"),
  request: {
    query: lessonQuery,
    body: { content: json(z.object({ text: z.string() })), required: true },
  },
  responses: {
    200: {
      description:
        "The stored note. A blank text removes it. Plain text, at most 2,000 characters, never sent to a model",
      content: json(note),
    },
    404: errorResponse("There is no such group"),
    422: errorResponse("Too long, or the id is a spare lesson's"),
  },
});
const summaryRoute = createRoute({
  method: "get",
  path: "/api/lesson-notes/summary",
  responses: {
    200: {
      description:
        "One row for each lesson that has a note or files, so the board can show a paper clip",
      content: json(
        z.object({
          items: z.array(
            z.object({
              groupId: z.string(),
              lessonId: z.string(),
              hasNote: z.boolean(),
              materials: z.number().int(),
            }),
          ),
        }),
      ),
    },
  },
});
const removedRoute = createRoute({
  method: "get",
  path: "/api/lesson-notes/removed",
  responses: {
    200: {
      description:
        "Notes and files for lessons no longer in the plan (taken out of the scheme). They are kept",
      content: json(
        z.object({
          items: z.array(note.extend({ title: z.string() })),
        }),
      ),
    },
  },
});
const attach = createRoute({
  method: "post",
  path: "/api/lesson-notes/materials",
  ...guard("lesson-plans", "edit"),
  description:
    "A multipart form with one field called `file` and the header `x-planner-upload: 1`. Accepted: .pptx, .docx, .xlsx, .pdf, .png, .jpg, checked by extension and first bytes; at most 25 MB, enforced while the body streams in. Stored as data/materials/<uuid>.<ext>; the name is kept in the database only. Never sent to a model",
  request: { query: lessonQuery },
  responses: {
    201: { description: "The attached file", content: json(material) },
    403: errorResponse(
      "Not allowed, or the x-planner-upload header is missing",
    ),
    404: errorResponse("There is no such group"),
    413: errorResponse("The file is over 25 MB"),
    422: errorResponse(
      "The type, the name or the contents are not acceptable, or the id is a spare lesson's",
    ),
  },
});
const download = createRoute({
  method: "get",
  path: "/api/materials/{id}",
  request: { params },
  responses: {
    200: {
      description:
        "The file, as an attachment with its stored content type and nosniff",
      content: { "application/octet-stream": { schema: z.string() } },
    },
    404: errorResponse("There is no such file, or it is no longer on disk"),
  },
});
const remove = createRoute({
  method: "delete",
  path: "/api/materials/{id}",
  ...guard("lesson-plans", "edit"),
  request: { params },
  responses: {
    200: {
      description: "Removed, from the list and from the disk",
      content: json(z.object({ ok: z.literal(true) })),
    },
    404: errorResponse("There is no such file"),
  },
});

/** `attachment; filename="ascii"; filename*=UTF-8''percent-encoded`, safe for any name the store accepted. */
export function attachmentHeader(name: string): string {
  const fallback = [...name]
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x20 || code > 0x7e || ch === '"' || ch === "\\" ? "_" : ch;
    })
    .join("");
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export function lessonNoteRoutes(deps: {
  repos: Repos;
  store: MaterialStore;
  now: () => Date;
}) {
  const { repos, store, now } = deps;
  return createRouter()
    .openapi(read, (c) => {
      const { groupId, lessonId } = c.req.valid("query");
      return c.json(readNote(repos, groupId, lessonId), 200);
    })
    .openapi(write, (c) => {
      const { groupId, lessonId } = c.req.valid("query");
      return c.json(
        writeNote(repos, groupId, lessonId, c.req.valid("json").text, now()),
        200,
      );
    })
    .openapi(summaryRoute, (c) => c.json({ items: summary(repos) }, 200))
    .openapi(removedRoute, (c) =>
      c.json({ items: removedFromPlan(repos) }, 200),
    )
    .openapi(attach, async (c) => {
      // A custom header cannot be set by a cross-site form post, which a multipart form can be.
      if (c.req.header("x-planner-upload") !== "1")
        return c.json(
          {
            error: {
              code: "forbidden",
              message: "Files can only be attached from the planner itself.",
            },
          },
          403,
        );
      const { groupId, lessonId } = c.req.valid("query");
      checkedLesson(repos, groupId, lessonId);
      const file = await receiveUpload(c.req.raw, store);
      try {
        return c.json(
          attachMaterial(repos, groupId, lessonId, file, now()),
          201,
        );
      } catch (err) {
        store.remove(file.storedName);
        throw err;
      }
    })
    .openapi(download, (c) => {
      const m = findMaterial(repos, c.req.valid("param").id);
      const stream = store.open(m.storedName);
      return c.body(Readable.toWeb(stream) as ReadableStream, 200, {
        "content-type": m.contentType,
        "content-length": String(m.size),
        "content-disposition": attachmentHeader(m.name),
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
        "cache-control": "no-store",
      }) as never;
    })
    .openapi(remove, (c) => {
      const m = findMaterial(repos, c.req.valid("param").id);
      repos.lessonNotes.removeMaterial(m.id);
      store.remove(m.storedName);
      return c.json({ ok: true as const }, 200);
    });
}
