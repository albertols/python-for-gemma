import { createRoute, z } from "@hono/zod-openapi";
import { auditSlots, fortnights, teachingBlocks } from "@planner/domain";
import type { Repos } from "../repos/ports.ts";
import { loadPlanning } from "../usecases/planning.ts";
import { createRouter } from "./router.ts";
import { dateRangeQuery, isoDate, period, slot } from "./schemas.ts";

const json = <T extends z.ZodType>(schema: T) => ({
  "application/json": { schema },
});

const getSlots = createRoute({
  method: "get",
  path: "/api/slots",
  request: { query: dateRangeQuery.extend({ groupId: z.string().optional() }) },
  responses: {
    200: { description: "Slots in slot order", content: json(z.array(slot)) },
  },
});
const getFortnights = createRoute({
  method: "get",
  path: "/api/fortnights",
  responses: {
    200: {
      description: "The Week 1 and Week 2 Mondays of each fortnight",
      content: json(
        z.array(
          z.object({
            w1: isoDate.nullable(),
            w2: isoDate.nullable(),
            breakBefore: z.boolean(),
          }),
        ),
      ),
    },
  },
});
const counts = z.object({
  open: z.number(),
  cancelled: z.number(),
  cover: z.number(),
});
const getAudit = createRoute({
  method: "get",
  path: "/api/audit",
  responses: {
    200: {
      description: "Lessons per teaching block, lost lessons and days off",
      content: json(
        z.object({
          rows: z.array(
            z.object({
              block: z.object({
                id: z.string(),
                termId: z.enum(["T1", "T2", "T3"]),
                from: isoDate,
                to: isoDate,
              }),
              perGroup: z.record(z.string(), counts),
            }),
          ),
          lost: z.array(slot),
          daysOff: z.array(
            z.object({
              date: isoDate,
              text: z.string().nullable(),
              wouldHaveHad: z.array(z.object({ groupId: z.string(), period })),
            }),
          ),
        }),
      ),
    },
  },
});

export function slotRoutes(deps: { repos: Repos }) {
  const { repos } = deps;
  const app = createRouter();

  app.openapi(getSlots, (c) => {
    const { from, to, groupId } = c.req.valid("query");
    const slots = loadPlanning(repos).slots.filter(
      (s) =>
        (from === undefined || s.date >= from) &&
        (to === undefined || s.date <= to) &&
        (groupId === undefined || s.groupId === groupId),
    );
    return c.json(slots, 200);
  });
  app.openapi(getFortnights, (c) =>
    c.json(fortnights(loadPlanning(repos).days), 200),
  );
  app.openapi(getAudit, (c) => {
    const { days, terms, slots, timetables, groups } = loadPlanning(repos);
    return c.json(
      auditSlots({
        slots,
        days,
        blocks: teachingBlocks(days, terms),
        timetables,
        groups,
      }),
      200,
    );
  });
  return app;
}
