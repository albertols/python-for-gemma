import { can, type Resource, type Role } from "@planner/domain";
import type { MiddlewareHandler } from "hono";

export type Principal = { role: Role };

const REFUSAL = {
  edit: "change",
  view: "see",
} as const;

/** Answers 403 unless the principal's role may do `action` on `resource`. */
export function requireAccess(
  resource: Resource,
  action: "view" | "edit",
): MiddlewareHandler {
  return async (c, next) => {
    const principal = c.get("principal" as never) as Principal | undefined;
    if (!principal || !can(principal.role, resource, action)) {
      return c.json(
        {
          error: {
            code: "forbidden",
            message: `You are not allowed to ${REFUSAL[action]} ${resource.replaceAll("-", " ")}.`,
          },
        },
        403,
      );
    }
    await next();
  };
}

/**
 * Spread into a createRoute() call: it adds the guard and records it in the
 * OpenAPI document as `x-access`, so a test can prove no write route lacks one.
 */
export function guard(resource: Resource, action: "view" | "edit") {
  return {
    middleware: [requireAccess(resource, action)],
    "x-access": { resource, action },
  };
}
