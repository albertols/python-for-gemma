import { QueryClient, useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, call } from "./client.ts";

/** One try: when the planner is not running, say so at once instead of waiting. */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

export type PlannerConfig = InferResponseType<typeof api.api.config.$get, 200>;

export function useConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: () => call<PlannerConfig>(() => api.api.config.$get()),
  });
}
