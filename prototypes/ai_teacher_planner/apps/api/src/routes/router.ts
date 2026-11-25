import { OpenAPIHono } from "@hono/zod-openapi";

/** One router per route file; a failed zod check is a 422 in our error shape. */
export function createRouter() {
  return new OpenAPIHono({
    defaultHook: (result, c) => {
      if (result.success) return;
      const message = result.error.issues
        .map((i) =>
          i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message,
        )
        .join("; ");
      return c.json({ error: { code: "invalid-request", message } }, 422);
    },
  });
}
