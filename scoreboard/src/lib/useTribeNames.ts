import { useQuery } from "@tanstack/react-query";
import { WORLD_API_BASE_URL } from "./constants";

export function useTribeNames(tribeIds: number[]) {
  const stableKey = [...tribeIds].sort((a, b) => a - b).join(",");
  return useQuery({
    queryKey: ["tribeNames", stableKey],
    enabled: tribeIds.length > 0 && WORLD_API_BASE_URL.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Map<number, string>> => {
      const names = new Map<number, string>();
      const unique = [...new Set(tribeIds)];
      const results = await Promise.allSettled(
        unique.map(async (id) => {
          const url = `${WORLD_API_BASE_URL.replace(/\/$/, "")}/v2/tribes/${id}`;
          const response = await fetch(url);
          if (!response.ok) return;
          const payload = (await response.json()) as Record<string, unknown>;
          const name = typeof payload.name === "string" ? payload.name.trim() : null;
          if (name) names.set(id, name);
        }),
      );
      void results;
      return names;
    },
  });
}
