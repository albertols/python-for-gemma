import { QueryClient, useQuery } from "@tanstack/react-query";
import { api, call } from "./client.ts";

/** One try: when the planner is not running, say so at once instead of waiting. */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

export interface PlannerConfig {
  today: string;
  timeZone: string;
  ai: {
    mode: "claude" | "fake" | "off";
    available: boolean;
    reason: string | null;
  };
}

export function useConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: () => call<PlannerConfig>(() => api.api.config.$get()),
  });
}
