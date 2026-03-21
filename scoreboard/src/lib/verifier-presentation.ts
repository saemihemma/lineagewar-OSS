import { useMemo } from "react";
import type {
  VerifierAuditInputSummary,
  VerifierSystemDisplayConfig,
} from "./verifier";
import { useSystemNames } from "./useSystemNames";

type AuditInputKey = keyof VerifierAuditInputSummary;

interface AuditPresentation {
  primary: string;
  secondary: string[];
}

interface PresentedSystemName {
  primary: string;
  secondary: string | null;
}

const SOURCE_LABELS: Record<string, string> = {
  "live-chain": "LIVE CHAIN",
  registry: "REGISTRY",
  chain: "CHAIN",
  seeded: "SEEDED",
  mock: "MOCK",
};

const AUDIT_MODE_LABELS: Record<string, string> = {
  graphql_per_tick_primary: "GraphQL ownership per tick",
  graphql_chain_discovery: "GraphQL chain discovery",
  registry_live_objects: "Live object registry",
  phase_config_live: "Active published phase",
  declared_active_system_ids: "Declared active systems",
  graphql_ownercap_chain: "GraphQL owner-to-tribe resolution",
  owner_tribe_registry_manifest: "Owner-to-tribe manifest",
  assembly_system_mapping_manifest: "Assembly-to-system manifest",
  location_hash_mapping_manifest: "Location-hash manifest",
  live_system_field_runtime_mapping: "Live runtime mapping",
  seeded_candidate_overlay: "Seeded candidate overlay",
  seeded_phase_overlay: "Seeded phase overlay",
  seeded_tribe_overlay: "Seeded tribe overlay",
  seeded_system_overlay: "Seeded system overlay",
};

function titleCaseWords(value: string): string {
  return value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numericSystemIds(systemIds: Array<string | number>): number[] {
  return [...new Set(
    systemIds
      .map((systemId) => Number(systemId))
      .filter((systemId) => Number.isFinite(systemId)),
  )].sort((a, b) => a - b);
}

function displayConfigNameMap(
  systemDisplayConfigs: VerifierSystemDisplayConfig[],
): Map<string, string> {
  return new Map(
    systemDisplayConfigs
      .map((entry) => [String(entry.systemId), trimText(entry.displayName)] as const)
      .filter((entry) => entry[1].length > 0),
  );
}

export function presentSourceLabel(raw: string | undefined): string {
  if (!raw) return "VERIFIER";
  return SOURCE_LABELS[raw] ?? titleCaseWords(raw).toUpperCase();
}

export function presentAuditSource(
  source: { mode: string; detail?: string; path?: string | null; objectCount?: number },
): AuditPresentation {
  const secondary: string[] = [`Raw mode: ${source.mode}`];
  const detail = trimText(source.detail);
  if (detail) secondary.push(detail);
  if (typeof source.objectCount === "number") {
    secondary.push(`${source.objectCount} object${source.objectCount === 1 ? "" : "s"}`);
  }
  const path = trimText(source.path);
  if (path) secondary.push(path);

  return {
    primary: AUDIT_MODE_LABELS[source.mode] ?? titleCaseWords(source.mode),
    secondary,
  };
}

export function presentAuditCategoryLabel(key: AuditInputKey): string {
  const labels: Record<AuditInputKey, string> = {
    candidateCollection: "CANDIDATES",
    activeSystems: "ACTIVE SYSTEMS",
    ownerResolution: "OWNER RESOLUTION",
    locationResolution: "LOCATION RESOLUTION",
  };
  return labels[key];
}

export function useResolvedSystemNames(
  systemIds: Array<string | number>,
  systemDisplayConfigs: VerifierSystemDisplayConfig[] = [],
): Map<string, string> {
  const uniqueSystemIds = useMemo(() => numericSystemIds(systemIds), [systemIds]);
  const systemNamesQuery = useSystemNames(uniqueSystemIds);

  return useMemo(() => {
    const byDisplayConfig = displayConfigNameMap(systemDisplayConfigs);
    const byWorldApi = systemNamesQuery.data ?? new Map<number, string>();
    const resolved = new Map<string, string>();

    for (const systemId of systemIds) {
      const key = String(systemId);
      const displayName = byDisplayConfig.get(key);
      if (displayName) {
        resolved.set(key, displayName);
        continue;
      }

      const numericId = Number(key);
      const worldName = Number.isFinite(numericId) ? trimText(byWorldApi.get(numericId)) : "";
      if (worldName) {
        resolved.set(key, worldName);
        continue;
      }

      resolved.set(key, key);
    }

    return resolved;
  }, [systemDisplayConfigs, systemIds, systemNamesQuery.data]);
}

export function buildSystemNameRecord(resolvedSystemNames: Map<string, string>): Record<string, string> {
  return Object.fromEntries(resolvedSystemNames.entries());
}

export function presentResolvedSystemName(
  systemId: string | number,
  resolvedSystemNames: Map<string, string>,
): PresentedSystemName {
  const key = String(systemId);
  const resolvedName = trimText(resolvedSystemNames.get(key)) || key;
  return {
    primary: resolvedName,
    secondary: resolvedName === key ? null : key,
  };
}
