import { useMemo } from "react";
import { useCurrentAccount, useCurrentClient } from "@mysten/dapp-kit-react";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_CAP_TYPE_SUFFIX, CURRENT_WAR_ID, LINEAGE_WAR_PACKAGE_ID, SYSTEM_CONFIG_TYPE_SUFFIX, WAR_REGISTRY_ID } from "./constants";
import { extractCreatedObjectsByType } from "./transactions";
import type { OwnedAdminCap, RecentPublishedSystemConfig } from "./types";

export function parseNumberList(value: string): number[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry));
}

export function parseDateTimeLocalToMs(value: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function toDateTimeLocalValue(timestampMs: number): string {
  const date = new Date(timestampMs);
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

export function formatTimestamp(timestampMs: number | null | undefined): string {
  if (!timestampMs) {
    return "Not set";
  }
  return new Date(timestampMs).toLocaleString();
}

export function shortenId(value: string, visible = 8): string {
  if (!value || value.length <= visible * 2) {
    return value;
  }
  return `${value.slice(0, visible)}...${value.slice(-visible)}`;
}

export function useOwnedAdminCaps() {
  const client = useCurrentClient();
  const account = useCurrentAccount();

  return useQuery({
    queryKey: ["ownedAdminCaps", account?.address, LINEAGE_WAR_PACKAGE_ID],
    enabled: Boolean(account?.address && LINEAGE_WAR_PACKAGE_ID !== "0x0"),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<OwnedAdminCap[]> => {
      const rpcClient = client as unknown as {
        getOwnedObjects: (input: unknown) => Promise<{
          data?: Array<{
            data?: {
              objectId?: string;
              type?: string;
              content?: { fields?: Record<string, unknown> };
            };
          }>;
        }>;
      };

      const response = await rpcClient.getOwnedObjects({
        owner: account?.address,
        filter: { StructType: `${LINEAGE_WAR_PACKAGE_ID}${ADMIN_CAP_TYPE_SUFFIX}` },
        options: { showType: true, showContent: true },
      });

      return (response.data ?? [])
        .map((entry) => {
          const objectId = entry.data?.objectId;
          const type = entry.data?.type ?? null;
          const rawWarId = entry.data?.content?.fields?.war_id;
          const warId = Number(rawWarId);

          if (!objectId) {
            return null;
          }

          return {
            objectId,
            warId: Number.isFinite(warId) ? warId : null,
            type,
          } satisfies OwnedAdminCap;
        })
        .filter((entry): entry is OwnedAdminCap => entry !== null);
    },
  });
}

/**
 * Auto-discovers the WarRegistry shared-object ID for a given war_id by querying
 * WarCreatedEvent events and extracting the created WarRegistry from the transaction.
 * Falls back to the VITE_WAR_REGISTRY_ID env var if set.
 */
export function useAutoRegistryId(warId: number | null): {
  registryId: string;
  isLoading: boolean;
  error: unknown;
  source: "env" | "chain" | "none";
} {
  const client = useCurrentClient();

  const envOverride = WAR_REGISTRY_ID !== "0x0" ? WAR_REGISTRY_ID : null;

  const discovery = useQuery({
    queryKey: ["autoRegistryDiscovery", LINEAGE_WAR_PACKAGE_ID, warId],
    enabled: !envOverride && warId != null && LINEAGE_WAR_PACKAGE_ID !== "0x0",
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const rpcClient = client as unknown as {
        queryEvents: (input: unknown) => Promise<{
          data?: Array<{
            id?: { txDigest?: string };
            parsedJson?: Record<string, unknown>;
          }>;
        }>;
        core: { getTransaction: (input: unknown) => Promise<unknown> };
      };

      const response = await rpcClient.queryEvents({
        query: {
          MoveEventType: `${LINEAGE_WAR_PACKAGE_ID}::registry::WarCreatedEvent`,
        },
        order: "descending",
        limit: 20,
      });

      for (const event of response.data ?? []) {
        const eventWarId = Number(event.parsedJson?.war_id);
        if (eventWarId !== warId) continue;

        const txDigest = event.id?.txDigest;
        if (!txDigest) continue;

        const tx = await rpcClient.core.getTransaction({
          digest: txDigest,
          include: { effects: true, objectTypes: true },
        });
        const created = extractCreatedObjectsByType(tx);
        const registryObjectId = Object.entries(created.createdByType).find(
          ([type]) => type.includes("::registry::WarRegistry"),
        )?.[1]?.[0] ?? null;

        if (registryObjectId) return registryObjectId;
      }

      return null;
    },
  });

  if (envOverride) {
    return { registryId: envOverride, isLoading: false, error: null, source: "env" };
  }
  if (discovery.data) {
    return { registryId: discovery.data, isLoading: false, error: discovery.error, source: "chain" };
  }
  return {
    registryId: "0x0",
    isLoading: discovery.isLoading,
    error: discovery.error,
    source: "none",
  };
}

export function useRecentPublishedSystemConfigs(
  limit = 10,
  filters?: { warId?: number | null; systemId?: number | null },
) {
  const client = useCurrentClient();
  const warIdFilter = filters?.warId ?? null;
  const systemIdFilter = filters?.systemId ?? null;

  return useQuery({
    queryKey: ["recentPublishedSystemConfigs", LINEAGE_WAR_PACKAGE_ID, limit, warIdFilter, systemIdFilter],
    enabled: LINEAGE_WAR_PACKAGE_ID !== "0x0",
    queryFn: async (): Promise<RecentPublishedSystemConfig[]> => {
      const rpcClient = client as unknown as {
        queryEvents: (input: unknown) => Promise<{
          data?: Array<{ id?: { txDigest?: string }; parsedJson?: Record<string, unknown> }>;
        }>;
        core: { getTransaction: (input: unknown) => Promise<unknown> };
      };

      const response = await rpcClient.queryEvents({
        query: { MoveEventType: `${LINEAGE_WAR_PACKAGE_ID}::config::SystemConfigPublishedEvent` },
        order: "descending",
        limit,
      });

      const results = await Promise.all(
        (response.data ?? []).map(async (event) => {
          const txDigest = event.id?.txDigest;
          if (!txDigest) {
            return null;
          }

          const transaction = await rpcClient.core.getTransaction({
            digest: txDigest,
            include: { effects: true, objectTypes: true },
          });
          const created = extractCreatedObjectsByType(transaction);
          const configObjectId =
            Object.entries(created.createdByType).find(([type]) => type.endsWith(SYSTEM_CONFIG_TYPE_SUFFIX))?.[1]?.[0] ?? null;

          if (!configObjectId) {
            return null;
          }

          const parsed = event.parsedJson ?? {};
          const warId = Number(parsed.war_id);
          const systemId = Number(parsed.system_id);
          const version = Number(parsed.version);
          const effectiveFromMs = Number(parsed.effective_from_ms);

          return {
            objectId: configObjectId,
            txDigest,
            warId: Number.isFinite(warId) ? warId : null,
            systemId: Number.isFinite(systemId) ? systemId : null,
            version: Number.isFinite(version) ? version : null,
            effectiveFromMs: Number.isFinite(effectiveFromMs) ? effectiveFromMs : null,
          } satisfies RecentPublishedSystemConfig;
        }),
      );

      return results.filter((entry): entry is RecentPublishedSystemConfig => {
        if (entry === null) {
          return false;
        }
        if (warIdFilter !== null && entry.warId !== warIdFilter) {
          return false;
        }
        if (systemIdFilter !== null && entry.systemId !== systemIdFilter) {
          return false;
        }
        return true;
      });
    },
  });
}

export function useLatestSystemConfigIdFromChain(limit = 10): string {
  const recentConfigs = useRecentPublishedSystemConfigs(limit);

  return useMemo(() => {
    return recentConfigs.data?.[0]?.objectId ?? "";
  }, [recentConfigs.data]);
}

interface OnChainPhaseSystemEntry {
  systemId: number;
  pointsPerTick: number;
  takeMargin: number;
  holdMargin: number;
  neutralMinTotalPresence: number;
  contestedWhenTied: boolean;
  enabled: boolean;
  allowedAssemblyFamilies: Array<{ family: number; weight: number }>;
  allowedAssemblyTypeIds: Array<{ typeId: number; weight: number }>;
}

interface OnChainPhaseEntry {
  version: number;
  effectiveFromMs: number;
  systems: OnChainPhaseSystemEntry[];
}

export function usePublishedPhaseTimeline(overrideWarId?: number | string | null) {
  const client = useCurrentClient();
  const warId = (overrideWarId != null ? Number(overrideWarId) : null) || Number(CURRENT_WAR_ID) || null;

  return useQuery({
    queryKey: ["publishedPhaseTimeline", LINEAGE_WAR_PACKAGE_ID, warId],
    enabled: LINEAGE_WAR_PACKAGE_ID !== "0x0" && warId != null,
    staleTime: 30_000,
    queryFn: async (): Promise<OnChainPhaseEntry[]> => {
      const rpcClient = client as unknown as {
        queryEvents: (input: unknown) => Promise<{
          data?: Array<{ id?: { txDigest?: string }; parsedJson?: Record<string, unknown> }>;
        }>;
        core: { getTransaction: (input: unknown) => Promise<unknown> };
        getObject: (input: unknown) => Promise<{ data?: { content?: { fields?: Record<string, unknown> } } }>;
      };

      const response = await rpcClient.queryEvents({
        query: { MoveEventType: `${LINEAGE_WAR_PACKAGE_ID}::config::PhaseConfigPublishedEvent` },
        order: "ascending",
        limit: 50,
      });

      const entries: OnChainPhaseEntry[] = [];
      for (const event of response.data ?? []) {
        const parsed = event.parsedJson ?? {};
        const eventWarId = Number(parsed.war_id);
        if (eventWarId !== warId) continue;

        const txDigest = event.id?.txDigest;
        if (!txDigest) continue;

        const tx = await rpcClient.core.getTransaction({
          digest: txDigest,
          include: { effects: true, objectTypes: true },
        });
        const created = extractCreatedObjectsByType(tx);
        const phaseConfigId = Object.entries(created.createdByType)
          .find(([type]) => type.includes("::config::PhaseConfig"))?.[1]?.[0] ?? null;

        if (!phaseConfigId) continue;

        const obj = await rpcClient.getObject({
          id: phaseConfigId,
          options: { showContent: true },
        });
        const fields = obj.data?.content?.fields as Record<string, unknown> | undefined;
        if (!fields) continue;

        entries.push({
          version: Number(fields.phase_id) || 0,
          effectiveFromMs: Number(fields.effective_from_ms) || 0,
          systems: [],
        });
      }

      return entries;
    },
  });
}

export function useCurrentWarTickRate(overrideWarId?: number | string | null) {
  const client = useCurrentClient();
  const warId = (overrideWarId != null ? Number(overrideWarId) : null) || Number(CURRENT_WAR_ID) || null;

  return useQuery({
    queryKey: ["currentWarTickRate", LINEAGE_WAR_PACKAGE_ID, warId],
    enabled: LINEAGE_WAR_PACKAGE_ID !== "0x0" && warId != null,
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const rpcClient = client as unknown as {
        queryEvents: (input: unknown) => Promise<{
          data?: Array<{ id?: { txDigest?: string }; parsedJson?: Record<string, unknown> }>;
        }>;
        core: { getTransaction: (input: unknown) => Promise<unknown> };
        getObject: (input: unknown) => Promise<{ data?: { content?: { fields?: Record<string, unknown> } } }>;
      };

      const response = await rpcClient.queryEvents({
        query: { MoveEventType: `${LINEAGE_WAR_PACKAGE_ID}::config::WarConfigPublishedEvent` },
        order: "descending",
        limit: 10,
      });

      for (const event of response.data ?? []) {
        const parsed = event.parsedJson ?? {};
        if (Number(parsed.war_id) !== warId) continue;

        const txDigest = event.id?.txDigest;
        if (!txDigest) continue;

        const tx = await rpcClient.core.getTransaction({
          digest: txDigest,
          include: { effects: true, objectTypes: true },
        });
        const created = extractCreatedObjectsByType(tx);
        const warConfigId = Object.entries(created.createdByType)
          .find(([type]) => type.includes("::config::WarConfigVersion"))?.[1]?.[0] ?? null;

        if (!warConfigId) continue;

        const obj = await rpcClient.getObject({
          id: warConfigId,
          options: { showContent: true },
        });
        const fields = obj.data?.content?.fields as Record<string, unknown> | undefined;
        const tickMinutes = Number(fields?.default_tick_minutes);
        if (Number.isFinite(tickMinutes) && tickMinutes > 0) {
          return tickMinutes;
        }
      }

      return 60;
    },
  });
}
