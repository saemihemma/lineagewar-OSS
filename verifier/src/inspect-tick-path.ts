import "dotenv/config";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { discoverWarConfig, refreshWarState } from "./discover-war-config.js";
import { RegistryBackedVerifierDataSource } from "./registry-source.js";
import { buildTickPlan } from "./tick-planner.js";
import type { VerifierConfig } from "./types.js";

function getArg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  return process.argv[index + 1] ?? null;
}

function alignTick(timestampMs: number, tickMinutes: number): number {
  const tickMs = tickMinutes * 60_000;
  return Math.floor(timestampMs / tickMs) * tickMs;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function looksLikePackageId(value: string | null | undefined): boolean {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value);
}

async function main(): Promise<void> {
  const packageId = process.env.LINEAGE_PACKAGE_ID ?? null;
  if (!packageId || packageId === "0x0") {
    throw new Error("LINEAGE_PACKAGE_ID must be set.");
  }

  const rpcUrl = process.env.LINEAGE_SUI_RPC || getJsonRpcFullnodeUrl("testnet");
  const graphqlUrl = process.env.LINEAGE_SUI_GRAPHQL_URL || null;
  const rawWarId = getArg("--war") ?? process.env.LINEAGE_WAR_ID ?? null;
  const warId = rawWarId != null ? Number(rawWarId) : null;
  const historyCount = Math.max(1, envNumber("LINEAGE_MAX_HISTORY_TICKS", 4));
  const rawNow = getArg("--now");
  const now = rawNow != null ? Number(rawNow) : Date.now();

  const discovered = await discoverWarConfig({
    packageId,
    rpcUrl,
    warId: Number.isFinite(warId) ? warId : null,
  });

  const refreshed = await refreshWarState({
    packageId,
    rpcUrl,
    warId: discovered.warId,
    warRegistryId: discovered.warRegistryId,
    warConfigIds: discovered.warConfigIds,
    phaseConfigIds: discovered.phaseConfigIds,
  });

  const config: VerifierConfig = {
    warId: discovered.warId,
    tickStartMs: now,
    tickCount: historyCount,
    phaseStatusWithheld: false,
    phaseId: null,
    phaseStartMs: null,
    phaseEndMs: null,
    nextPhaseStartMs: null,
    phaseLabel: null,
    warEndMs: refreshed.endedAtMs,
    outputJson: false,
    source: "registry",
    scenario: "two-tribe-two-system",
    outputPath: null,
    systemDisplayConfigPath: null,
    chain: {
      rpcUrl,
      warRegistryId: discovered.warRegistryId,
      warConfigIds: refreshed.warConfigIds,
      phaseConfigIds: refreshed.phaseConfigIds,
      systemConfigIds: refreshed.systemConfigIds,
      activeSystemIds: [],
      warSystemIds: refreshed.warSystemIds,
      participatingTribeIds: discovered.participatingTribeIds,
      packageId,
      adminCapId: process.env.LINEAGE_ADMIN_CAP_ID ?? null,
      assemblyRegistryPath: process.env.LINEAGE_ASSEMBLY_REGISTRY_PATH ?? null,
      assemblyObjectIds: [],
      ownerTribeRegistryPath: process.env.LINEAGE_OWNER_TRIBE_REGISTRY_PATH ?? null,
      locationMappingPath: process.env.LINEAGE_LOCATION_MAPPING_PATH ?? null,
      assemblySystemMappingPath: process.env.LINEAGE_ASSEMBLY_SYSTEM_MAPPING_PATH ?? null,
      graphqlUrl,
      locationQueryMode: (() => {
        const raw = process.env.LINEAGE_LOCATION_QUERY_MODE || "auto";
        return raw === "auto" || raw === "graphql" || raw === "rpc" || raw === "off" ? raw : "auto";
      })(),
      locationEventType: process.env.LINEAGE_LOCATION_EVENT_TYPE
        || (process.env.LINEAGE_WORLD_PACKAGE_ID
          ? `${process.env.LINEAGE_WORLD_PACKAGE_ID}::location::LocationRevealedEvent`
          : null),
      locationEventsPageSize: envNumber("LINEAGE_LOCATION_EVENTS_PAGE_SIZE", 50),
      locationEventsMaxPages: envNumber("LINEAGE_LOCATION_EVENTS_MAX_PAGES", 20),
      worldPackageId: process.env.LINEAGE_WORLD_PACKAGE_ID ?? null,
      worldTenant: process.env.LINEAGE_WORLD_TENANT ?? null,
      assemblyDiscoveryMode: (() => {
        const raw = process.env.LINEAGE_ASSEMBLY_DISCOVERY_MODE || "off";
        return raw === "graphql" ? "graphql" : "off";
      })(),
    },
  };

  const dataSource = new RegistryBackedVerifierDataSource(config);
  const warConfig = await dataSource.getWarConfigAt(now);
  const activePhase = await dataSource.getActivePhaseAt(now);
  const effectiveTickMinutes = activePhase?.tickMinutesOverride ?? warConfig.defaultTickMinutes;
  const currentBoundaryMs = alignTick(now, effectiveTickMinutes);
  const tickStartMs = currentBoundaryMs - Math.max(0, historyCount - 1) * effectiveTickMinutes * 60_000;
  const tickPlan = await buildTickPlan(dataSource, tickStartMs, historyCount, refreshed.endedAtMs);
  const currentBoundaryEntries = tickPlan.filter((entry) => entry.tickTimestampMs === currentBoundaryMs);

  console.log(JSON.stringify({
    now,
    nowIso: new Date(now).toISOString(),
    env: {
      packageId,
      packageIdLooksValid: looksLikePackageId(packageId),
      rpcUrl,
      graphqlUrl,
      requestedWarId: Number.isFinite(warId) ? warId : null,
    },
    discovered: {
      warId: discovered.warId,
      warRegistryId: discovered.warRegistryId,
      warDisplayName: discovered.warDisplayName,
      warEnabled: discovered.warEnabled,
      warResolved: discovered.warResolved,
      defaultTickMinutes: discovered.defaultTickMinutes,
      warSystemIds: discovered.warSystemIds,
      configCounts: {
        warConfigIds: discovered.warConfigIds.length,
        phaseConfigIds: discovered.phaseConfigIds.length,
        systemConfigIds: discovered.systemConfigIds.length,
        tribes: discovered.participatingTribeIds.length,
      },
    },
    refreshed: {
      enabled: refreshed.enabled,
      resolved: refreshed.resolved,
      endedAtMs: refreshed.endedAtMs,
      winMargin: refreshed.winMargin,
      effectiveTickMinutes: refreshed.effectiveTickMinutes,
      warSystemIds: refreshed.warSystemIds,
      configCounts: {
        warConfigIds: refreshed.warConfigIds.length,
        phaseConfigIds: refreshed.phaseConfigIds.length,
        systemConfigIds: refreshed.systemConfigIds.length,
      },
    },
    warConfig: {
      version: warConfig.version,
      effectiveFromMs: warConfig.effectiveFromMs,
      effectiveUntilMs: warConfig.effectiveUntilMs,
      defaultTickMinutes: warConfig.defaultTickMinutes,
    },
    activePhase: activePhase ? {
      phaseId: activePhase.phaseId,
      displayName: activePhase.displayName,
      effectiveFromMs: activePhase.effectiveFromMs,
      effectiveUntilMs: activePhase.effectiveUntilMs,
      tickMinutesOverride: activePhase.tickMinutesOverride,
      activeSystemIds: activePhase.activeSystemIds,
    } : null,
    tickPlan: {
      tickStartMs,
      tickStartIso: new Date(tickStartMs).toISOString(),
      historyCount,
      effectiveTickMinutes,
      currentBoundaryMs,
      currentBoundaryIso: new Date(currentBoundaryMs).toISOString(),
      entryCount: tickPlan.length,
      currentBoundaryEntryCount: currentBoundaryEntries.length,
      currentBoundarySystemIds: [...new Set(currentBoundaryEntries.map((entry) => entry.systemId))].sort((a, b) => a - b),
      entries: tickPlan.map((entry) => ({
        tickTimestampMs: entry.tickTimestampMs,
        tickTimestampIso: new Date(entry.tickTimestampMs).toISOString(),
        systemId: entry.systemId,
      })),
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
