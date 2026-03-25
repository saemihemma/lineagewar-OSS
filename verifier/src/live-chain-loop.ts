console.log(`[verifier] Starting... (pid=${process.pid}, node=${process.version}, PORT=${process.env.PORT || "unset"})`);

import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { writeVerifierArtifacts } from "./artifact-output.js";
import {
  defaultEditorialDisplayPath,
  readEditorialDisplayEntries,
  readEditorialDisplayEntriesForWar,
  resolveCurrentSystemDisplayConfigs,
  upsertEditorialDisplayEntries,
} from "./editorial-display-store.js";
import { buildScoreboardPayload } from "./frontend-output.js";
import { GraphqlAssemblyResolutionError } from "./graphql-assembly-source.js";
import { hashCanonicalSnapshot } from "./hash.js";
import { submitResolveWarWithRetry, type ResolutionResult } from "./on-chain-resolve.js";
import { RegistryBackedVerifierDataSource } from "./registry-source.js";
import { resolveTick } from "./resolver.js";
import { loadSystemDisplayConfigs } from "./system-display-config.js";
import { TickLedger, type CommittedTick } from "./tick-ledger.js";
import { buildTickPlan } from "./tick-planner.js";
import {
  discoverLatestResolvedWarResolution,
  discoverWarConfig,
  refreshWarState,
  type DiscoveredWarConfig,
  type DiscoveredWarResolution,
} from "./discover-war-config.js";
import type {
  EditorialDisplayEntry,
  ResolvedTickResult,
  SystemConfigVersion,
  SystemDisplayConfig,
  TickPlanEntry,
  TickResolutionMetadata,
  TickStatus,
  VerifierConfig,
  VerifierDataSource,
} from "./types.js";

console.log(`[verifier] All modules loaded successfully.`);

const PAUSED_POLL_MS = 5 * 60_000;
const TICK_BUFFER_MS = 30_000;
const MAX_CATCHUP_TICKS = 48;
const WAR_POLL_MS = 5 * 60_000;

type VerifierRuntimeState = "discovering" | "running" | "waiting" | "resolved";

interface RuntimeStatus {
  state: VerifierRuntimeState;
  warId: number | null;
  tickRateMinutes: number;
  lastTickMs: number | null;
  nextTickMs: number | null;
}

interface RuntimeDiscoveryError {
  stage: string;
  message: string;
  atMs: number;
}

interface NotifyHint {
  warId?: number;
  txDigest?: string;
  reason?: string;
  receivedAtMs: number;
}

interface PublishedArtifactSummary {
  path: string;
  exists: boolean;
  updatedAtMs: number | null;
  warId: number | null;
  tickCount: number | null;
  lastTickMs: number | null;
  tickStatus: TickStatus | null;
  systemCount: number | null;
  error: string | null;
}

interface RuntimeWarSnapshot {
  warId: number;
  warRegistryId: string;
  warDisplayName: string;
  warEnabled: boolean;
  warResolved: boolean;
  defaultTickMinutes: number;
  configCounts: {
    warConfigIds: number;
    phaseConfigIds: number;
    systemConfigIds: number;
    warSystemIds: number;
    participatingTribes: number;
  };
  warSystemIds: number[];
  participatingTribes: number[];
  atMs: number;
}

interface RuntimeRefreshSnapshot {
  warId: number;
  enabled: boolean;
  resolved: boolean;
  endedAtMs: number | null;
  winMargin: number;
  effectiveTickMinutes: number;
  configCounts: {
    warConfigIds: number;
    phaseConfigIds: number;
    systemConfigIds: number;
    warSystemIds: number;
  };
  warSystemIds: number[];
  atMs: number;
}

interface RuntimePhaseSnapshot {
  atMs: number;
  warConfigDefaultTickMinutes: number;
  phaseId: number | null;
  displayName: string | null;
  effectiveFromMs: number | null;
  effectiveUntilMs: number | null;
  tickMinutesOverride: number | null;
  activeSystemIds: number[];
}

interface RuntimeTickPlanSnapshot {
  atMs: number;
  tickStartMs: number;
  historicalTickCount: number;
  currentBoundaryMs: number;
  entryCount: number;
  currentBoundaryEntryCount: number;
  uniqueSystemIds: number[];
  currentBoundarySystemIds: number[];
  sampleEntries: Array<{ tickTimestampMs: number; systemId: number }>;
}

interface RuntimeDiagnostics {
  configured: {
    packageId: string | null;
    packageIdLooksValid: boolean;
    rpcUrl: string | null;
    graphqlUrl: string | null;
    warIdOverride: number | null;
    outputPath: string | null;
    editorialDisplayPath: string | null;
  };
  lastDiscoveryError: RuntimeDiscoveryError | null;
  latestPublishedArtifact: PublishedArtifactSummary | null;
  lastDiscoveredWar: RuntimeWarSnapshot | null;
  lastRefreshState: RuntimeRefreshSnapshot | null;
  lastActivePhase: RuntimePhaseSnapshot | null;
  lastTickPlan: RuntimeTickPlanSnapshot | null;
}

interface TickRunOutcome {
  resolved: ResolvedTickResult[];
  tickStatus: TickStatus | null;
  degradedReason: string | null;
  carriedForwardFromTickMs: number | null;
  lastTickMs: number | null;
}

let notifyResolve: (() => void) | null = null;
let refreshResolve: (() => void) | null = null;
let latestNotifyHint: NotifyHint | null = null;
let activeShutdownHandler: (() => Promise<void>) | null = null;
let signalHandlersRegistered = false;
let lastHydratedResolvedWarId: number | null = null;
const runtimeStatus: RuntimeStatus = {
  state: "discovering",
  warId: null,
  tickRateMinutes: 60,
  lastTickMs: null,
  nextTickMs: null,
};
const runtimeDiagnostics: RuntimeDiagnostics = {
  configured: {
    packageId: null,
    packageIdLooksValid: false,
    rpcUrl: null,
    graphqlUrl: null,
    warIdOverride: null,
    outputPath: null,
    editorialDisplayPath: null,
  },
  lastDiscoveryError: null,
  latestPublishedArtifact: null,
  lastDiscoveredWar: null,
  lastRefreshState: null,
  lastActivePhase: null,
  lastTickPlan: null,
};

function envString(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function alignTick(timestampMs: number, tickMinutes: number): number {
  const tickMs = tickMinutes * 60_000;
  return Math.floor(timestampMs / tickMs) * tickMs;
}

function shortId(id: string): string {
  if (id.length <= 16) return id;
  return id.slice(0, 8) + "..." + id.slice(-4);
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(" ");
}

function defaultRuntimeOutputPath(): string {
  return path.resolve(process.cwd(), "runtime/verifier/latest.json");
}

function editorialDisplayPathForOutput(outputPath: string): string {
  return path.resolve(process.cwd(), process.env.LINEAGE_EDITORIAL_DISPLAY_PATH ?? defaultEditorialDisplayPath(outputPath));
}

interface CurrentPhaseMetadata {
  phaseId: number | null;
  phaseLabel: string | null;
  phaseStartMs: number | null;
  phaseEndMs: number | null;
  nextPhaseStartMs: number | null;
  tickRateMinutes: number;
  activeSystemIds: number[];
}

function buildBootstrapTribeScores(discovered: DiscoveredWarConfig) {
  return discovered.participatingTribeIds.map((id, index) => ({
    id,
    name: discovered.tribeNames[String(id)] ?? `Tribe ${id}`,
    points: 0,
    color: `var(--tribe-${String.fromCharCode(97 + index)})`,
  }));
}

async function collectPhaseMetadata(
  dataSource: RegistryBackedVerifierDataSource,
  timestampMs: number,
  fallbackTickMinutes: number,
): Promise<CurrentPhaseMetadata> {
  const warConfig = await dataSource.getWarConfigAt(timestampMs);
  const currentPhase = await dataSource.getActivePhaseAt(timestampMs);
  const nextPhase = await dataSource.getNextPhaseAfter(timestampMs);

  return {
    phaseId: currentPhase?.phaseId ?? null,
    phaseLabel: currentPhase?.displayName ?? null,
    phaseStartMs: currentPhase?.effectiveFromMs ?? null,
    phaseEndMs: currentPhase?.effectiveUntilMs ?? nextPhase?.effectiveFromMs ?? null,
    nextPhaseStartMs: nextPhase?.effectiveFromMs ?? currentPhase?.effectiveUntilMs ?? null,
    tickRateMinutes: currentPhase?.tickMinutesOverride ?? warConfig.defaultTickMinutes ?? fallbackTickMinutes,
    activeSystemIds: currentPhase?.activeSystemIds ? [...currentPhase.activeSystemIds] : [],
  };
}

async function collectActiveSystemConfigs(
  dataSource: RegistryBackedVerifierDataSource,
  systemIds: number[],
  timestampMs: number,
): Promise<SystemConfigVersion[]> {
  const results = await Promise.all(
    [...new Set(systemIds)].map(async (systemId) => {
      try {
        return await dataSource.getSystemConfigAt(systemId, timestampMs);
      } catch {
        return null;
      }
    }),
  );

  return results
    .filter((entry): entry is SystemConfigVersion => entry !== null)
    .sort((a, b) => a.systemId - b.systemId);
}

function buildBootstrapSystems(
  systemConfigs: SystemConfigVersion[],
  systemDisplayConfigs: SystemDisplayConfig[],
) {
  const displayBySystemId = new Map(systemDisplayConfigs.map((entry) => [String(entry.systemId), entry]));
  return systemConfigs.map((config) => ({
    id: String(config.systemId),
    name: displayBySystemId.get(String(config.systemId))?.displayName || String(config.systemId),
    state: 0,
    pointsPerTick: config.pointsPerTick,
  }));
}

function looksLikePackageId(value: string | null | undefined): boolean {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function setLastDiscoveryError(stage: string, error: unknown): void {
  runtimeDiagnostics.lastDiscoveryError = {
    stage,
    message: errorMessage(error),
    atMs: Date.now(),
  };
}

function clearLastDiscoveryError(): void {
  runtimeDiagnostics.lastDiscoveryError = null;
}

function summarizeDiscoveredWar(discovered: DiscoveredWarConfig): RuntimeWarSnapshot {
  return {
    warId: discovered.warId,
    warRegistryId: discovered.warRegistryId,
    warDisplayName: discovered.warDisplayName,
    warEnabled: discovered.warEnabled,
    warResolved: discovered.warResolved,
    defaultTickMinutes: discovered.defaultTickMinutes,
    configCounts: {
      warConfigIds: discovered.warConfigIds.length,
      phaseConfigIds: discovered.phaseConfigIds.length,
      systemConfigIds: discovered.systemConfigIds.length,
      warSystemIds: discovered.warSystemIds.length,
      participatingTribes: discovered.participatingTribeIds.length,
    },
    warSystemIds: [...discovered.warSystemIds],
    participatingTribes: [...discovered.participatingTribeIds],
    atMs: Date.now(),
  };
}

function summarizeRefreshState(
  warId: number,
  freshState: Awaited<ReturnType<typeof refreshWarState>>,
): RuntimeRefreshSnapshot {
  return {
    warId,
    enabled: freshState.enabled,
    resolved: freshState.resolved,
    endedAtMs: freshState.endedAtMs,
    winMargin: freshState.winMargin,
    effectiveTickMinutes: freshState.effectiveTickMinutes,
    configCounts: {
      warConfigIds: freshState.warConfigIds.length,
      phaseConfigIds: freshState.phaseConfigIds.length,
      systemConfigIds: freshState.systemConfigIds.length,
      warSystemIds: freshState.warSystemIds.length,
    },
    warSystemIds: [...freshState.warSystemIds],
    atMs: Date.now(),
  };
}

function readPublishedArtifactSummary(outputPath: string): PublishedArtifactSummary {
  const base: PublishedArtifactSummary = {
    path: outputPath,
    exists: false,
    updatedAtMs: null,
    warId: null,
    tickCount: null,
    lastTickMs: null,
    tickStatus: null,
    systemCount: null,
    error: null,
  };

  if (!existsSync(outputPath)) {
    return base;
  }

  base.exists = true;
  base.updatedAtMs = statSync(outputPath).mtimeMs;

  try {
    const parsed = JSON.parse(readFileSync(outputPath, "utf8")) as {
      config?: { warId?: unknown; tickCount?: unknown; tickStatus?: unknown };
      scoreboard?: { lastTickMs?: unknown; systems?: unknown[] };
      tickStatus?: unknown;
    };
    const rawConfig = parsed.config ?? {};
    const rawScoreboard = parsed.scoreboard ?? {};
    const warId = Number(rawConfig.warId);
    const tickCount = Number(rawConfig.tickCount);
    const lastTickMs = Number(rawScoreboard.lastTickMs);
    const rawTickStatus = rawConfig.tickStatus ?? parsed.tickStatus;
    base.warId = Number.isFinite(warId) ? warId : null;
    base.tickCount = Number.isFinite(tickCount) ? tickCount : null;
    base.lastTickMs = Number.isFinite(lastTickMs) ? lastTickMs : null;
    base.tickStatus = rawTickStatus === "live_resolved" || rawTickStatus === "degraded_frozen"
      ? rawTickStatus
      : null;
    base.systemCount = Array.isArray(rawScoreboard.systems) ? rawScoreboard.systems.length : 0;
  } catch (error) {
    base.error = errorMessage(error);
  }

  return base;
}

function refreshPublishedArtifactSummary(outputPath: string): void {
  runtimeDiagnostics.latestPublishedArtifact = readPublishedArtifactSummary(outputPath);
}

function resolutionArtifactPath(outputPath: string): string {
  return path.join(path.dirname(outputPath), "resolution.json");
}

function writeResolutionArtifact(outputPath: string, resolutionBlock: Record<string, unknown>): void {
  const targetPath = resolutionArtifactPath(outputPath);
  mkdirSync(path.dirname(targetPath), { recursive: true });
  const tmpPath = targetPath + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(resolutionBlock, null, 2) + "\n", "utf8");
  renameSync(tmpPath, targetPath);
}

function clearResolutionArtifact(outputPath: string): void {
  const targetPath = resolutionArtifactPath(outputPath);
  if (!existsSync(targetPath)) {
    return;
  }
  unlinkSync(targetPath);
}

function publishedArtifactHasResolvedWar(outputPath: string, warId: number): boolean {
  if (!existsSync(outputPath) || !existsSync(resolutionArtifactPath(outputPath))) {
    return false;
  }

  try {
    const latestJson = JSON.parse(readFileSync(outputPath, "utf8")) as {
      config?: { warId?: unknown };
      resolution?: { transactionDigest?: unknown } | null;
    };
    return Number(latestJson.config?.warId) === warId
      && typeof latestJson.resolution?.transactionDigest === "string"
      && latestJson.resolution.transactionDigest.length > 0;
  } catch {
    return false;
  }
}

function buildResolutionBlock(
  discovered: DiscoveredWarConfig,
  resolution: DiscoveredWarResolution,
  tribeNameOverrides: Record<string, string>,
) {
  const allScores = resolution.tribeScores.map((entry) => ({
    tribeId: entry.tribeId,
    name: tribeNameOverrides[String(entry.tribeId)] ?? entry.displayName ?? `Tribe ${entry.tribeId}`,
    points: entry.score,
  }));
  const winner = resolution.victorTribeId == null
    ? null
    : allScores.find((entry) => entry.tribeId === resolution.victorTribeId) ?? null;
  const runnerUp = allScores
    .filter((entry) => winner == null || entry.tribeId !== winner.tribeId)
    .sort((a, b) => b.points - a.points)[0] ?? null;
  const actualMargin = allScores.length >= 2
    ? Math.max(0, allScores[0].points - allScores[1].points)
    : allScores[0]?.points ?? 0;
  const winMargin = resolution.winMarginAtResolution ?? discovered.winMargin;

  return {
    warResolutionObjectId: resolution.warResolutionObjectId,
    transactionDigest: resolution.transactionDigest,
    winner,
    runnerUp,
    allScores,
    isDraw: resolution.victorTribeId == null,
    winMargin,
    actualMargin,
    endedAtMs: discovered.endedAtMs,
    resolvedAtMs: resolution.resolvedAtMs ?? Date.now(),
  };
}

function currentNotifyHint(): NotifyHint | null {
  return latestNotifyHint ? { ...latestNotifyHint } : null;
}

function rememberNotifyHint(hint: Omit<NotifyHint, "receivedAtMs">): NotifyHint {
  latestNotifyHint = {
    ...hint,
    receivedAtMs: Date.now(),
  };
  return latestNotifyHint;
}

function maybeClearNotifyHintForWar(warId: number): void {
  if (latestNotifyHint?.warId === warId) {
    latestNotifyHint = null;
  }
}

function triggerNotify(): void {
  if (notifyResolve) {
    notifyResolve();
    notifyResolve = null;
  }
  if (refreshResolve) {
    refreshResolve();
    refreshResolve = null;
  }
}

function waitForRefresh(): Promise<void> {
  return new Promise((resolve) => {
    refreshResolve = resolve;
  });
}

function waitForNotifyOrTimeout(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { notifyResolve = null; resolve(); }, ms);
    notifyResolve = () => { clearTimeout(timer); resolve(); };
  });
}

function ensureSignalHandlers(): void {
  if (signalHandlersRegistered) {
    return;
  }

  const shutdown = (): void => {
    void (async () => {
      try {
        await activeShutdownHandler?.();
      } finally {
        process.exit(0);
      }
    })();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  signalHandlersRegistered = true;
}

function isGraphqlResolutionFailure(error: unknown): boolean {
  if (error instanceof GraphqlAssemblyResolutionError) {
    return true;
  }
  if (error instanceof Error && "cause" in error) {
    return isGraphqlResolutionFailure((error as Error & { cause?: unknown }).cause);
  }
  return false;
}

function resolutionMetadata(
  tickStatus: TickStatus,
  resolutionSource: TickResolutionMetadata["resolutionSource"],
  degradedReason: string | null,
  carriedForwardFromTickMs: number | null,
): TickResolutionMetadata {
  return {
    tickStatus,
    resolutionSource,
    degradedReason,
    carriedForwardFromTickMs,
  };
}

function latestResolvedForSystem(
  entries: ResolvedTickResult[],
  systemId: number,
  beforeTickMs: number,
): ResolvedTickResult | null {
  const matches = entries
    .filter((entry) => entry.snapshot.systemId === systemId && entry.snapshot.tickTimestampMs < beforeTickMs)
    .sort((a, b) => b.snapshot.tickTimestampMs - a.snapshot.tickTimestampMs);
  return matches[0] ?? null;
}

function buildCarriedForwardTick(
  prior: ResolvedTickResult,
  tickTimestampMs: number,
  degradedReason: string,
): ResolvedTickResult {
  const cloned = structuredClone(prior);
  const metadata = resolutionMetadata(
    "degraded_frozen",
    "carried_forward",
    degradedReason,
    prior.snapshot.tickTimestampMs,
  );

  cloned.snapshot.tickTimestampMs = tickTimestampMs;
  cloned.snapshot.resolutionMetadata = metadata;
  cloned.commitment.tickTimestampMs = tickTimestampMs;
  cloned.commitment.resolutionMetadata = metadata;
  cloned.resolution.tickTimestampMs = tickTimestampMs;
  cloned.presenceRows = cloned.presenceRows.map((row) => ({
    ...row,
    tickTimestampMs,
  }));
  const snapshotHash = hashCanonicalSnapshot(cloned.snapshot);
  cloned.commitment.snapshotHash = snapshotHash;
  return cloned;
}

async function buildDegradedPlaceholderTick(
  dataSource: VerifierDataSource,
  tick: TickPlanEntry,
  degradedReason: string,
): Promise<ResolvedTickResult> {
  const placeholderDataSource: VerifierDataSource = {
    getWarConfigAt: (timestampMs) => dataSource.getWarConfigAt(timestampMs),
    getActivePhaseAt: (timestampMs) => dataSource.getActivePhaseAt(timestampMs),
    getSystemConfigAt: (systemId, timestampMs) => dataSource.getSystemConfigAt(systemId, timestampMs),
    getCandidateAssemblies: async () => [],
    getPreviousController: (systemId, timestampMs) => dataSource.getPreviousController(systemId, timestampMs),
    getAuditInputSummary: dataSource.getAuditInputSummary?.bind(dataSource),
  };
  const base = await resolveTick(placeholderDataSource, tick);
  const metadata = resolutionMetadata("degraded_frozen", "degraded_placeholder", degradedReason, null);
  const snapshot = {
    ...base.snapshot,
    resolutionMetadata: metadata,
  };
  const commitment = {
    ...base.commitment,
    snapshotHash: hashCanonicalSnapshot(snapshot),
    resolutionMetadata: metadata,
  };

  return {
    ...base,
    snapshot,
    commitment,
  };
}

async function discoverPreferredWar(
  packageId: string,
  rpcUrl: string,
  preferredWarId?: number | null,
): Promise<DiscoveredWarConfig> {
  if (preferredWarId != null) {
    try {
      const hinted = await discoverWarConfig({
        packageId,
        rpcUrl,
        warId: preferredWarId,
      });
      if (!hinted.warResolved) {
        return hinted;
      }
    } catch (error) {
      console.warn(
        `Preferred war ${preferredWarId} could not be discovered yet: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return discoverWarConfig({
    packageId,
    rpcUrl,
    warId: null,
  });
}

function buildVerifierConfig(
  discovered: DiscoveredWarConfig,
  rpcUrl: string,
  graphqlUrl: string | null,
  outputPath: string,
): VerifierConfig {
  return {
    warId: discovered.warId,
    tickStartMs: Date.now(),
    tickCount: 1,
    phaseStatusWithheld: false,
    phaseId: null,
    phaseStartMs: null,
    phaseEndMs: null,
    nextPhaseStartMs: null,
    phaseLabel: null,
    warEndMs: null,
    outputJson: false,
    source: "registry",
    scenario: "two-tribe-two-system",
    outputPath,
    systemDisplayConfigPath: process.env.LINEAGE_SYSTEM_DISPLAY_CONFIG_PATH ?? null,
    chain: {
      rpcUrl,
      warRegistryId: discovered.warRegistryId,
      warConfigIds: discovered.warConfigIds,
      phaseConfigIds: discovered.phaseConfigIds,
      systemConfigIds: discovered.systemConfigIds,
      activeSystemIds: [],
      warSystemIds: discovered.warSystemIds,
      participatingTribeIds: discovered.participatingTribeIds,
      packageId: process.env.LINEAGE_PACKAGE_ID ?? null,
      adminCapId: process.env.LINEAGE_ADMIN_CAP_ID ?? null,
      assemblyRegistryPath: process.env.LINEAGE_ASSEMBLY_REGISTRY_PATH ?? null,
      assemblyObjectIds: [],
      ownerTribeRegistryPath: process.env.LINEAGE_OWNER_TRIBE_REGISTRY_PATH ?? null,
      locationMappingPath: process.env.LINEAGE_LOCATION_MAPPING_PATH ?? null,
      assemblySystemMappingPath: process.env.LINEAGE_ASSEMBLY_SYSTEM_MAPPING_PATH ?? null,
      graphqlUrl,
      locationQueryMode: (() => {
        const raw = process.env.LINEAGE_LOCATION_QUERY_MODE || "auto";
        if (raw === "auto" || raw === "graphql" || raw === "rpc" || raw === "off") return raw;
        return "auto";
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
}

async function writeBootstrapScoreboard(
  config: VerifierConfig,
  discovered: DiscoveredWarConfig,
  outputPath: string,
  fallbackTickRateMinutes: number,
): Promise<void> {
  const now = Date.now();
  const dataSource = new RegistryBackedVerifierDataSource(config);
  const phaseMetadata = await collectPhaseMetadata(dataSource, now, fallbackTickRateMinutes);
  const activeSystemIds =
    phaseMetadata.activeSystemIds.length > 0 ? phaseMetadata.activeSystemIds : discovered.warSystemIds;
  const legacySystemDisplayConfigs = loadSystemDisplayConfigs(
    config.systemDisplayConfigPath,
    process.env.LINEAGE_SYSTEM_NAMES_PATH ?? null,
  );
  const editorialDisplayEntries = readEditorialDisplayEntries(editorialDisplayPathForOutput(outputPath));
  const systemDisplayConfigs = resolveCurrentSystemDisplayConfigs({
    entries: editorialDisplayEntries,
    legacyConfigs: legacySystemDisplayConfigs,
    warId: discovered.warId,
    atMs: now,
    phaseId: phaseMetadata.phaseId,
    systemIds: activeSystemIds,
  });
  const systemConfigs = await collectActiveSystemConfigs(dataSource, activeSystemIds, now);
  const tribeScores = buildBootstrapTribeScores(discovered);
  const auditInputs = dataSource.getAuditInputSummary?.() ?? {
    candidateCollection: { mode: "registry_live_objects" },
    activeSystems: { mode: "phase_config_live" },
    ownerResolution: { mode: "graphql_ownercap_chain" },
    locationResolution: { mode: "live_system_field_runtime_mapping" },
  };
  auditInputs.activeSystems = {
    mode: "phase_config_live",
    detail:
      phaseMetadata.phaseLabel && activeSystemIds.length > 0
        ? `${phaseMetadata.phaseLabel} // ${activeSystemIds.join(", ")}`
        : phaseMetadata.phaseLabel
          ? `${phaseMetadata.phaseLabel} // no active systems`
          : activeSystemIds.length > 0
            ? activeSystemIds.join(", ")
            : "No active systems published yet.",
    objectCount: activeSystemIds.length,
  };
  const initialEnvelope = {
    tickStatus: null,
    degradedReason: null,
    carriedForwardFromTickMs: null,
    config: {
      source: "live-chain",
      warId: discovered.warId,
      tickStartMs: now,
      tickCount: 0,
      phaseStatusWithheld: false,
      phaseId: phaseMetadata.phaseId,
      phaseStartMs: phaseMetadata.phaseStartMs,
      phaseEndMs: phaseMetadata.phaseEndMs,
      nextPhaseStartMs: phaseMetadata.nextPhaseStartMs,
      phaseLabel: phaseMetadata.phaseLabel,
      warEndMs: discovered.endedAtMs,
      tickRateMinutes: phaseMetadata.tickRateMinutes,
      tickStatus: null,
      degradedReason: null,
      carriedForwardFromTickMs: null,
    },
    tickPlan: [],
    commitments: [],
    snapshots: [],
    scoreboard: {
      warName: discovered.warDisplayName || `War ${discovered.warId}`,
      lastTickMs: null,
      tickRateMinutes: phaseMetadata.tickRateMinutes,
      tribeScores,
      systems: buildBootstrapSystems(systemConfigs, systemDisplayConfigs),
      chartData: [],
      chartSeries: tribeScores.map((tribeScore) => ({
        tribeId: tribeScore.id,
        dataKey: `tribe_${tribeScore.id}`,
        name: tribeScore.name,
        color: tribeScore.color,
      })),
      commitments: [],
      snapshots: [],
    },
    systemDisplayConfigs,
  };

  await writeVerifierArtifacts(outputPath, initialEnvelope, "live-chain", auditInputs, [], editorialDisplayEntries);
}

async function runTick(
  config: VerifierConfig,
  discovered: DiscoveredWarConfig,
  outputPath: string,
  tickMinutes: number,
  historicalTickCount: number,
  ledger: TickLedger | null,
  warEndMs?: number | null,
): Promise<TickRunOutcome> {
  const now = Date.now();
  const tickMs = tickMinutes * 60_000;
  const currentTickBoundary = alignTick(now, tickMinutes);
  const tickStartMs = currentTickBoundary - Math.max(0, historicalTickCount - 1) * tickMs;

  config.tickStartMs = tickStartMs;
  config.tickCount = historicalTickCount;

  const dataSource = new RegistryBackedVerifierDataSource(config);
  const currentWarConfig = await dataSource.getWarConfigAt(now);
  const currentPhase = await dataSource.getActivePhaseAt(now);
  const nextPhase = await dataSource.getNextPhaseAfter(now);
  const currentPhaseEndMs = currentPhase?.effectiveUntilMs ?? nextPhase?.effectiveFromMs ?? null;
  const nextPhaseStartMs = nextPhase?.effectiveFromMs ?? currentPhase?.effectiveUntilMs ?? null;
  const currentEffectiveTickMinutes = currentPhase?.tickMinutesOverride ?? currentWarConfig.defaultTickMinutes;
  runtimeDiagnostics.lastActivePhase = {
    atMs: now,
    warConfigDefaultTickMinutes: currentWarConfig.defaultTickMinutes,
    phaseId: currentPhase?.phaseId ?? null,
    displayName: currentPhase?.displayName ?? null,
    effectiveFromMs: currentPhase?.effectiveFromMs ?? null,
    effectiveUntilMs: currentPhaseEndMs,
    tickMinutesOverride: currentPhase?.tickMinutesOverride ?? null,
    activeSystemIds: currentPhase?.activeSystemIds ? [...currentPhase.activeSystemIds] : [],
  };
  config.phaseId = currentPhase?.phaseId ?? null;
  config.phaseStartMs = currentPhase?.effectiveFromMs ?? null;
  config.phaseEndMs = currentPhaseEndMs;
  config.nextPhaseStartMs = nextPhaseStartMs;
  config.phaseLabel = currentPhase?.displayName ?? null;
  config.warEndMs = warEndMs ?? discovered.endedAtMs ?? null;
  runtimeStatus.tickRateMinutes = currentEffectiveTickMinutes;
  console.log(
    `  Active phase: ${currentPhase ? `${currentPhase.displayName} (#${currentPhase.phaseId})` : "none"} | `
    + `phase systems: ${currentPhase?.activeSystemIds.length ?? 0} | `
    + `effective tick: ${currentEffectiveTickMinutes}m`,
  );

  if (config.chain.locationQueryMode !== "off") {
    const added = await dataSource.refreshLocationMappingsFromEvents();
    if (added > 0) console.log(`  Location events: ${added} assembly(s) in war systems`);
  }
  dataSource.promoteDiscoveredAssemblyIds();

  if (config.chain.assemblyDiscoveryMode !== "off") {
    const discovered = await dataSource.discoverAssembliesFromChain();
    if (discovered > 0) console.log(`  Assembly discovery: ${discovered} assemblies found`);
  }

  const worldApiBase = process.env.LINEAGE_WORLD_API_BASE;
  if (worldApiBase) {
    await dataSource.enrichTribeNamesFromWorldApi(worldApiBase);
  }

  const auditInputs = dataSource.getAuditInputSummary?.() ?? {
    candidateCollection: { mode: "registry" },
    activeSystems: { mode: "unknown" },
    ownerResolution: { mode: "unknown" },
    locationResolution: { mode: "unknown" },
  };
  if (currentPhase) {
    auditInputs.activeSystems = {
      mode: "phase_config_live",
      detail:
        currentPhase.activeSystemIds.length > 0
          ? `${currentPhase.displayName} // ${currentPhase.activeSystemIds.join(", ")}`
          : `${currentPhase.displayName} // no active systems`,
      objectCount: currentPhase.activeSystemIds.length,
    };
  }

  const tickPlan = await buildTickPlan(dataSource, tickStartMs, historicalTickCount, warEndMs);
  const currentBoundaryEntries = tickPlan.filter((entry) => entry.tickTimestampMs === currentTickBoundary);
  const uniqueSystemIds = [...new Set(tickPlan.map((entry) => entry.systemId))].sort((a, b) => a - b);
  const currentBoundarySystemIds = [...new Set(currentBoundaryEntries.map((entry) => entry.systemId))].sort((a, b) => a - b);
  runtimeDiagnostics.lastTickPlan = {
    atMs: Date.now(),
    tickStartMs,
    historicalTickCount,
    currentBoundaryMs: currentTickBoundary,
    entryCount: tickPlan.length,
    currentBoundaryEntryCount: currentBoundaryEntries.length,
    uniqueSystemIds,
    currentBoundarySystemIds,
    sampleEntries: tickPlan.slice(0, 8).map((entry) => ({
      tickTimestampMs: entry.tickTimestampMs,
      systemId: entry.systemId,
    })),
  };
  console.log(
    `  Tick plan: ${tickPlan.length} entries total | `
    + `${currentBoundaryEntries.length} for current boundary | `
    + `systems: ${currentBoundarySystemIds.length > 0 ? currentBoundarySystemIds.join(", ") : "none"}`,
  );
  const legacySystemDisplayConfigs = loadSystemDisplayConfigs(
    config.systemDisplayConfigPath,
    process.env.LINEAGE_SYSTEM_NAMES_PATH ?? null,
  );
  const editorialDisplayEntries = readEditorialDisplayEntries(editorialDisplayPathForOutput(outputPath));
  const currentDisplaySystemIds =
    currentPhase?.activeSystemIds.length ? currentPhase.activeSystemIds : discovered.warSystemIds;
  const systemDisplayConfigs = resolveCurrentSystemDisplayConfigs({
    entries: editorialDisplayEntries,
    legacyConfigs: legacySystemDisplayConfigs,
    warId: discovered.warId,
    atMs: now,
    phaseId: currentPhase?.phaseId ?? null,
    systemIds: currentDisplaySystemIds,
  });

  // Load ALL committed ticks from the ledger -- this is the permanent scoring history
  const committedMap = new Map<string, ResolvedTickResult>();
  if (ledger) {
    const committed = await ledger.loadCommittedTicks(config.warId);
    for (const ct of committed) {
      committedMap.set(`${ct.systemId}:${ct.tickTimestampMs}`, ct.resolved);
    }
  }

  // Start with full ledger history -- scores are permanent regardless of tick rate changes
  let resolved: ResolvedTickResult[] = [...committedMap.values()];
  const newlyResolved: CommittedTick[] = [];
  const corrections: Array<{
    systemId: number;
    tickTimestampMs: number;
    previousState: string | null;
    previousPoints: number | null;
    correctedState: string;
    correctedPoints: number;
    correctedAt: string;
  }> = [];
  const ticksToResolve: TickPlanEntry[] = [];
  let tickStatus: TickStatus | null = null;
  let degradedReason: string | null = null;
  let carriedForwardFromTickMs: number | null = null;

  // Only resolve NEW ticks from the plan that aren't already in the ledger
  for (const tick of tickPlan) {
    const key = `${tick.systemId}:${tick.tickTimestampMs}`;
    const isCurrentTick = tick.tickTimestampMs === currentTickBoundary;
    const inLedger = committedMap.has(key);

    if (inLedger && !isCurrentTick) {
      continue;
    }
    ticksToResolve.push(tick);
  }

  try {
    for (const tick of ticksToResolve) {
      const key = `${tick.systemId}:${tick.tickTimestampMs}`;
      const isCurrentTick = tick.tickTimestampMs === currentTickBoundary;
      const inLedger = committedMap.has(key);
      const result = await resolveTick(dataSource, tick);
      tickStatus = result.snapshot.resolutionMetadata.tickStatus;

      if (inLedger) {
        const idx = resolved.findIndex(
          (entry) => entry.snapshot.systemId === tick.systemId && entry.snapshot.tickTimestampMs === tick.tickTimestampMs,
        );
        if (idx >= 0) resolved[idx] = result;
        else resolved.push(result);
      } else {
        resolved.push(result);
      }

      if (!isCurrentTick && tick.tickTimestampMs < currentTickBoundary && !inLedger) {
        const totalPoints = result.snapshot.pointsAwarded.reduce((sum, award) => sum + award.points, 0);
        corrections.push({
        systemId: tick.systemId,
        tickTimestampMs: tick.tickTimestampMs,
        previousState: null,
        previousPoints: null,
        correctedState: result.snapshot.state,
        correctedPoints: totalPoints,
        correctedAt: new Date().toISOString(),
      });
        console.log(
        `  Correction: system ${tick.systemId} tick ${new Date(tick.tickTimestampMs).toISOString()} ` +
        `re-resolved as ${result.snapshot.state} (${totalPoints} pts) — previous ledger entry was deleted`,
      );
      }

      newlyResolved.push({
        warId: config.warId,
        systemId: tick.systemId,
        tickTimestampMs: tick.tickTimestampMs,
        resolved: result,
        committedAt: new Date(),
      });
    }
  } catch (error) {
    if (!isGraphqlResolutionFailure(error)) {
      throw error;
    }

    degradedReason =
      error instanceof Error
        ? error.message
        : "GraphQL ownership resolution failed after retries";
    tickStatus = "degraded_frozen";
    resolved = [...committedMap.values()];
    newlyResolved.length = 0;

    console.error(`  GraphQL ownership resolution failed. Freezing ${ticksToResolve.length} tick(s).`);
    console.error(`  Reason: ${degradedReason}`);

    for (const tick of ticksToResolve) {
      const prior = latestResolvedForSystem(resolved, tick.systemId, tick.tickTimestampMs);
      const degradedResult = prior
        ? buildCarriedForwardTick(prior, tick.tickTimestampMs, degradedReason)
        : await buildDegradedPlaceholderTick(dataSource, tick, degradedReason);

      carriedForwardFromTickMs ??= degradedResult.snapshot.resolutionMetadata.carriedForwardFromTickMs;

      const idx = resolved.findIndex(
        (entry) => entry.snapshot.systemId === tick.systemId && entry.snapshot.tickTimestampMs === tick.tickTimestampMs,
      );
      if (idx >= 0) {
        resolved[idx] = degradedResult;
      } else {
        resolved.push(degradedResult);
      }

      newlyResolved.push({
        warId: config.warId,
        systemId: tick.systemId,
        tickTimestampMs: tick.tickTimestampMs,
        resolved: degradedResult,
        committedAt: new Date(),
      });
    }
  }

  if (ledger && newlyResolved.length > 0) {
    await ledger.commitTicks(newlyResolved);
  }

  const ledgerCount = committedMap.size;
  if (ledgerCount > 0 || newlyResolved.length > 0) {
    console.log(`  ${ledgerCount} tick(s) from ledger, ${newlyResolved.length} resolved live (${resolved.length} total)`);
  }

  const tribeNameOverrides = {
    ...discovered.tribeNames,
    ...dataSource.getTribeNameMap(),
  };
  const scoreboardMetadata = {
    warName: discovered.warDisplayName || `War ${discovered.warId}`,
    tribeNames: tribeNameOverrides,
  };
  const payload = buildScoreboardPayload(
    scoreboardMetadata,
    resolved.map((e) => e.snapshot),
    resolved.map((e) => e.commitment),
    discovered.participatingTribeIds,
    {
      tickRateMinutes: currentEffectiveTickMinutes,
      systemDisplayConfigs,
    },
  );

  const envelope = {
    tickStatus,
    degradedReason,
    carriedForwardFromTickMs,
    config: {
      source: "live-chain",
      warId: config.warId,
      tickStartMs,
      tickCount: historicalTickCount,
      phaseStatusWithheld: config.phaseStatusWithheld,
      phaseId: config.phaseId,
      phaseStartMs: config.phaseStartMs,
      phaseEndMs: config.phaseEndMs,
      nextPhaseStartMs: config.nextPhaseStartMs,
      phaseLabel: config.phaseLabel,
      warEndMs: config.warEndMs,
      tickRateMinutes: currentEffectiveTickMinutes,
      tickStatus,
      degradedReason,
      carriedForwardFromTickMs,
    },
    tickPlan,
    commitments: resolved.map((e) => e.commitment),
    snapshots: resolved.map((e) => e.snapshot),
    scoreboard: payload,
    systemDisplayConfigs,
    ...(corrections.length > 0 ? { corrections } : {}),
  };

  await writeVerifierArtifacts(outputPath, envelope, "live-chain", auditInputs, resolved, editorialDisplayEntries);
  refreshPublishedArtifactSummary(outputPath);

  // Log latest tick results
  const latestTickMs = currentTickBoundary;
  const latestResults = resolved.filter((r) => r.snapshot.tickTimestampMs === latestTickMs);
  if (latestResults.length > 0) {
    for (const r of latestResults) {
      const scores = payload.tribeScores.map((t) => `${t.name} ${t.points}`).join(" | ");
      console.log(
        `  Tick resolved: system ${r.snapshot.systemId} ${r.snapshot.state} | ${scores}`,
      );
    }
  } else if (resolved.length > 0) {
    const last = resolved[resolved.length - 1];
    console.log(
      `  Latest: system ${last.snapshot.systemId} ${last.snapshot.state} (tick ${new Date(last.snapshot.tickTimestampMs).toISOString()})`,
    );
  } else {
    console.log("  No ticks resolved (no active systems in current phase?)");
  }

  return {
    resolved,
    tickStatus,
    degradedReason,
    carriedForwardFromTickMs,
    lastTickMs: resolved.length > 0 ? resolved[resolved.length - 1].snapshot.tickTimestampMs : null,
  };
}

async function hydrateLatestResolvedWarArtifacts(
  packageId: string,
  rpcUrl: string,
  graphqlUrl: string | null,
  outputPath: string,
): Promise<number | null> {
  const databaseUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL || null;
  if (!databaseUrl) {
    return null;
  }

  const latestResolvedWar = await discoverLatestResolvedWarResolution({
    packageId,
    rpcUrl,
  });
  if (!latestResolvedWar) {
    return null;
  }

  if (
    lastHydratedResolvedWarId === latestResolvedWar.warId
    && publishedArtifactHasResolvedWar(outputPath, latestResolvedWar.warId)
  ) {
    return latestResolvedWar.warId;
  }

  const discovered = await discoverWarConfig({
    packageId,
    rpcUrl,
    warId: latestResolvedWar.warId,
  });

  const ledger = new TickLedger(databaseUrl);
  let committed: CommittedTick[] = [];
  try {
    await ledger.ensureTable();
    committed = await ledger.loadCommittedTicks(discovered.warId);
  } finally {
    await ledger.close();
  }

  if (committed.length === 0) {
    console.warn(`  No committed ticks found for resolved War ${discovered.warId}; leaving public artifacts unchanged.`);
    return null;
  }

  const resolved = committed
    .map((entry) => entry.resolved)
    .sort((a, b) => a.snapshot.tickTimestampMs - b.snapshot.tickTimestampMs || a.snapshot.systemId - b.snapshot.systemId);
  const firstTickMs = resolved[0]?.snapshot.tickTimestampMs ?? null;
  const lastTickMs = resolved.length > 0 ? resolved[resolved.length - 1].snapshot.tickTimestampMs : null;
  const referenceMs = lastTickMs ?? discovered.endedAtMs ?? Date.now();
  const tickTimestamps = [...new Set(resolved.map((entry) => entry.snapshot.tickTimestampMs))].sort((a, b) => a - b);
  const trackedSystemIds = [...new Set(resolved.map((entry) => entry.snapshot.systemId))].sort((a, b) => a - b);

  const config = buildVerifierConfig(discovered, rpcUrl, graphqlUrl, outputPath);
  const dataSource = new RegistryBackedVerifierDataSource(config);
  const phaseMetadata = await collectPhaseMetadata(dataSource, referenceMs, discovered.defaultTickMinutes);
  const legacySystemDisplayConfigs = loadSystemDisplayConfigs(
    config.systemDisplayConfigPath,
    process.env.LINEAGE_SYSTEM_NAMES_PATH ?? null,
  );
  const editorialDisplayEntries = readEditorialDisplayEntries(editorialDisplayPathForOutput(outputPath));
  const systemDisplayConfigs = resolveCurrentSystemDisplayConfigs({
    entries: editorialDisplayEntries,
    legacyConfigs: legacySystemDisplayConfigs,
    warId: discovered.warId,
    atMs: referenceMs,
    phaseId: phaseMetadata.phaseId,
    systemIds: trackedSystemIds.length > 0 ? trackedSystemIds : discovered.warSystemIds,
  });
  const tribeNameOverrides = {
    ...discovered.tribeNames,
    ...Object.fromEntries(
      latestResolvedWar.tribeScores.map((entry) => [String(entry.tribeId), entry.displayName] as const),
    ),
    ...dataSource.getTribeNameMap(),
  };
  const payload = buildScoreboardPayload(
    {
      warName: discovered.warDisplayName || latestResolvedWar.warDisplayName || `War ${discovered.warId}`,
      tribeNames: tribeNameOverrides,
    },
    resolved.map((entry) => entry.snapshot),
    resolved.map((entry) => entry.commitment),
    discovered.participatingTribeIds,
    {
      tickRateMinutes: phaseMetadata.tickRateMinutes,
      systemDisplayConfigs,
    },
  );
  const latestSnapshot = resolved.length > 0 ? resolved[resolved.length - 1].snapshot : null;
  const tickStatus = latestSnapshot?.resolutionMetadata.tickStatus ?? null;
  const degradedReason = latestSnapshot?.resolutionMetadata.degradedReason ?? null;
  const carriedForwardFromTickMs = latestSnapshot?.resolutionMetadata.carriedForwardFromTickMs ?? null;
  const activeSystems = phaseMetadata.activeSystemIds.length > 0
    ? phaseMetadata.activeSystemIds
    : trackedSystemIds;
  const auditInputs = dataSource.getAuditInputSummary?.() ?? {
    candidateCollection: { mode: "registry_live_objects" },
    activeSystems: { mode: "phase_config_live" },
    ownerResolution: { mode: "graphql_ownercap_chain" },
    locationResolution: { mode: "live_system_field_runtime_mapping" },
  };
  auditInputs.activeSystems = {
    mode: "phase_config_live",
    detail:
      phaseMetadata.phaseLabel && activeSystems.length > 0
        ? `${phaseMetadata.phaseLabel} // ${activeSystems.join(", ")}`
        : phaseMetadata.phaseLabel
          ? `${phaseMetadata.phaseLabel} // no active systems`
          : activeSystems.length > 0
            ? activeSystems.join(", ")
            : "No active systems published yet.",
    objectCount: activeSystems.length,
  };

  const resolutionBlock = buildResolutionBlock(discovered, latestResolvedWar, tribeNameOverrides);
  const envelope = {
    tickStatus,
    degradedReason,
    carriedForwardFromTickMs,
    config: {
      source: "live-chain",
      warId: discovered.warId,
      tickStartMs: firstTickMs ?? referenceMs,
      tickCount: tickTimestamps.length,
      phaseStatusWithheld: false,
      phaseId: phaseMetadata.phaseId,
      phaseStartMs: phaseMetadata.phaseStartMs,
      phaseEndMs: phaseMetadata.phaseEndMs,
      nextPhaseStartMs: phaseMetadata.nextPhaseStartMs,
      phaseLabel: phaseMetadata.phaseLabel,
      warEndMs: discovered.endedAtMs,
      tickRateMinutes: phaseMetadata.tickRateMinutes,
      tickStatus,
      degradedReason,
      carriedForwardFromTickMs,
    },
    tickPlan: resolved.map((entry) => ({
      tickTimestampMs: entry.snapshot.tickTimestampMs,
      systemId: entry.snapshot.systemId,
    })),
    commitments: resolved.map((entry) => entry.commitment),
    snapshots: resolved.map((entry) => entry.snapshot),
    scoreboard: payload,
    systemDisplayConfigs,
    resolution: resolutionBlock,
  };

  await writeVerifierArtifacts(outputPath, envelope, "live-chain", auditInputs, resolved, editorialDisplayEntries);
  writeResolutionArtifact(outputPath, resolutionBlock);
  refreshPublishedArtifactSummary(outputPath);
  lastHydratedResolvedWarId = discovered.warId;
  console.log(`  Preserved ended War ${discovered.warId} as the public frozen artifact while waiting for the next war.`);
  return discovered.warId;
}

async function runWarLoop(
  discovered: DiscoveredWarConfig,
  packageId: string,
  rpcUrl: string,
  graphqlUrl: string | null,
  outputPath: string,
  maxHistory: number,
  once: boolean,
  warIdOverride?: number | null,
): Promise<void> {

  console.log(`Found War ${discovered.warId} (registry ${shortId(discovered.warRegistryId)})`);
  console.log(`  Display name: ${discovered.warDisplayName}`);
  console.log(`  Enabled: ${discovered.warEnabled} | Resolved: ${discovered.warResolved}`);
  console.log(`  War configs: ${discovered.warConfigIds.length} | Phase configs: ${discovered.phaseConfigIds.length} | System configs: ${discovered.systemConfigIds.length}`);
  console.log(`  Tick rate: ${discovered.defaultTickMinutes}m`);
  if (discovered.warSystemIds.length > 0) {
    console.log(`  War systems: ${discovered.warSystemIds.join(", ")}`);
  }
  if (discovered.participatingTribeIds.length > 0) {
    const tribeList = discovered.participatingTribeIds
      .map((id) => `${discovered.tribeNames[String(id)] ?? "?"} (${id})`)
      .join(", ");
    console.log(`  Tribes: ${tribeList}`);
  }
  if (discovered.endedAtMs != null) {
    console.log(`  War end: ${new Date(discovered.endedAtMs).toISOString()}`);
  }
  console.log(`  Win margin: ${discovered.winMargin}`);
  console.log(`  Output: ${outputPath}`);
  console.log("");
  runtimeDiagnostics.lastDiscoveredWar = summarizeDiscoveredWar(discovered);
  clearLastDiscoveryError();

  if (discovered.warResolved) {
    if (warIdOverride != null) {
      console.log("War is already resolved. Nothing to do (explicit LINEAGE_WAR_ID set).");
      return;
    }
    console.log("War is already resolved. Will poll for next unresolved war...");
    await pollForNextWar(packageId, rpcUrl, graphqlUrl, outputPath, maxHistory, once);
    return;
  }

  lastHydratedResolvedWarId = null;
  clearResolutionArtifact(outputPath);

  const hasConfigs = discovered.systemConfigIds.length > 0;

  if (!hasConfigs) {
    console.log("\nWar has no published configs yet:");
    if (discovered.warConfigIds.length === 0) console.log("  - No WarConfigVersion published (optional, defaults apply)");
    if (discovered.phaseConfigIds.length === 0) console.log("  - No PhaseConfig published (optional, defaults apply)");
    if (discovered.systemConfigIds.length === 0) console.log("  - No SystemConfigVersion published (required)");
    if (discovered.systemConfigIds.length === 0) console.log("  - No SystemConfigVersion published");
    console.log("  Use the admin panel to publish phase configuration before starting the loop.");
    if (once) return;
    console.log("  Will poll for configs...\n");
  }

  let currentTickMinutes = discovered.defaultTickMinutes;
  let currentConfig = buildVerifierConfig(discovered, rpcUrl, graphqlUrl, outputPath);
  runtimeStatus.state = "running";
  runtimeStatus.warId = discovered.warId;
  runtimeStatus.tickRateMinutes = currentTickMinutes;
  runtimeStatus.lastTickMs = null;
  runtimeStatus.nextTickMs = null;

  // Initialize tick ledger (PostgreSQL persistence)
  const databaseUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL || null;
  let ledger: TickLedger | null = null;
  if (databaseUrl) {
    ledger = new TickLedger(databaseUrl);
    await ledger.ensureTable();
    console.log("  Tick ledger: PostgreSQL connected");
  } else {
    console.log("  Tick ledger: disabled (no DATABASE_URL). All ticks will be resolved live each cycle.");
  }

  // Write initial scoreboard immediately so the frontend has fresh war data
  await writeBootstrapScoreboard(currentConfig, discovered, outputPath, currentTickMinutes);
  refreshPublishedArtifactSummary(outputPath);
  console.log(`Wrote initial scoreboard for War ${discovered.warId} to ${outputPath}`);
  runtimeStatus.lastTickMs = null;

  // Initial tick (only if configs exist)
  if (hasConfigs) {
    console.log(`Running initial tick (up to ${maxHistory} historical ticks)...`);
    const initialOutcome = await runTick(
      currentConfig,
      discovered,
      outputPath,
      currentTickMinutes,
      maxHistory,
      ledger,
      discovered.endedAtMs,
    );
    runtimeStatus.lastTickMs = initialOutcome.lastTickMs;
    console.log(`Wrote scoreboard to ${outputPath}`);
  }

  if (once) {
    console.log("\n--once flag set, exiting.");
    if (ledger) await ledger.close();
    return;
  }

  // Continuous loop
  let timer: ReturnType<typeof setTimeout> | null = null;

  const scheduleNext = (): void => {
    const now = Date.now();
    const tickMs = currentTickMinutes * 60_000;
    const nextBoundary = alignTick(now, currentTickMinutes) + tickMs;
    const sleepMs = Math.max(1000, nextBoundary + TICK_BUFFER_MS - now);
    runtimeStatus.state = "running";
    runtimeStatus.warId = discovered.warId;
    runtimeStatus.tickRateMinutes = currentTickMinutes;
    runtimeStatus.nextTickMs = nextBoundary;

    console.log(`\nNext tick at ${new Date(nextBoundary).toISOString()} (in ${formatDuration(sleepMs)})`);

    timer = setTimeout(() => {
      void cycle().catch((err) => {
        setLastDiscoveryError("scheduled_tick_cycle", err);
        console.error("Tick cycle failed:", err);
        scheduleNext();
      });
    }, sleepMs);

    waitForRefresh().then(() => {
      if (timer) clearTimeout(timer);
      console.log(`\n[${new Date().toISOString()}] /notify received — running immediate refresh cycle...`);
      void cycle().catch((err) => {
        setLastDiscoveryError("notify_refresh_cycle", err);
        console.error("Refresh cycle failed:", err);
        scheduleNext();
      });
    });
  };

  const cycle = async (): Promise<void> => {
    console.log(`\n[${new Date().toISOString()}] Running tick cycle...`);

    const hintedWarId = currentNotifyHint()?.warId ?? null;
    if (warIdOverride == null && hintedWarId != null && hintedWarId !== discovered.warId) {
      try {
        const hintedWar = await discoverWarConfig({
          packageId,
          rpcUrl,
          warId: hintedWarId,
        });
        if (!hintedWar.warResolved) {
          console.log(`  Notify hint requested handoff from War ${discovered.warId} to War ${hintedWar.warId}.`);
          if (timer) clearTimeout(timer);
          if (ledger) await ledger.close();
          maybeClearNotifyHintForWar(hintedWar.warId);
          await runWarLoop(hintedWar, packageId, rpcUrl, graphqlUrl, outputPath, maxHistory, false);
          return;
        }
      } catch (error) {
        setLastDiscoveryError("notify_handoff", error);
        console.error(`  Notify-hinted war handoff failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Re-check war state and config changes
    const freshState = await refreshWarState({
      packageId,
      rpcUrl,
      warId: discovered.warId,
      warRegistryId: discovered.warRegistryId,
      warConfigIds: discovered.warConfigIds,
      phaseConfigIds: discovered.phaseConfigIds,
    });
    runtimeDiagnostics.lastRefreshState = summarizeRefreshState(discovered.warId, freshState);
    console.log(
      `  Refresh state: enabled=${freshState.enabled} resolved=${freshState.resolved} `
      + `tick=${freshState.effectiveTickMinutes}m configs=${freshState.systemConfigIds.length} `
      + `warSystems=${freshState.warSystemIds.length}`,
    );
    const rediscovered = await discoverWarConfig({
      packageId,
      rpcUrl,
      warId: discovered.warId,
    });
    runtimeDiagnostics.lastDiscoveredWar = summarizeDiscoveredWar(rediscovered);
    clearLastDiscoveryError();
    discovered.warConfigIds = rediscovered.warConfigIds;
    discovered.phaseConfigIds = rediscovered.phaseConfigIds;
    discovered.systemConfigIds = rediscovered.systemConfigIds;
    discovered.warSystemIds = rediscovered.warSystemIds;
    discovered.participatingTribeIds = rediscovered.participatingTribeIds;
    discovered.tribeNames = rediscovered.tribeNames;
    discovered.defaultTickMinutes = rediscovered.defaultTickMinutes;
    currentConfig.chain.participatingTribeIds = rediscovered.participatingTribeIds;
    currentConfig.chain.warSystemIds = rediscovered.warSystemIds;

    if (freshState.resolved) {
      runtimeStatus.state = "resolved";
      runtimeStatus.nextTickMs = null;
      console.log("War already resolved on chain. Writing final scoreboard.");
      const finalOutcome = await runTick(
        currentConfig,
        discovered,
        outputPath,
        currentTickMinutes,
        maxHistory,
        ledger,
        freshState.endedAtMs,
      );
      runtimeStatus.lastTickMs = finalOutcome.lastTickMs;
      console.log("Final scoreboard written.");
      if (ledger) await ledger.close();
      if (warIdOverride != null) {
        console.log("Goodbye (explicit LINEAGE_WAR_ID set).");
        return;
      }
      console.log("Polling for next unresolved war...");
      await pollForNextWar(packageId, rpcUrl, graphqlUrl, outputPath, maxHistory, false);
      return;
    }

    if (freshState.endedAtMs != null && Date.now() >= freshState.endedAtMs) {
      console.log(`War ended at ${new Date(freshState.endedAtMs).toISOString()}. Running final tick and resolving on chain...`);

      const finalResults = await runTick(currentConfig, discovered, outputPath, currentTickMinutes, maxHistory, ledger, freshState.endedAtMs);
      runtimeStatus.lastTickMs = finalResults.lastTickMs;
      console.log("Final scoreboard written.");

      const adminPrivateKey = process.env.LINEAGE_ADMIN_PRIVATE_KEY;
      if (!adminPrivateKey) {
        console.error("LINEAGE_ADMIN_PRIVATE_KEY not set. Cannot submit resolve_war transaction.");
        console.error("War continues — will retry next cycle. Set env var or resolve manually from admin panel.");
        scheduleNext();
        return;
      }

      const allScoreMap = new Map<number, number>();
      for (const r of finalResults.resolved) {
        for (const award of r.snapshot.pointsAwarded) {
          allScoreMap.set(award.tribeId, (allScoreMap.get(award.tribeId) ?? 0) + award.points);
        }
      }

      console.log("  All tribe scores (including non-participants):");
      for (const [tid, sc] of allScoreMap) {
        const name = discovered.tribeNames[String(tid)] ?? `Tribe ${tid}`;
        console.log(`    ${name}: ${sc}`);
      }

      const registeredTribeIds = new Set(discovered.participatingTribeIds);
      const tribeScores = discovered.participatingTribeIds
        .map((tribeId) => ({ tribeId, score: allScoreMap.get(tribeId) ?? 0 }))
        .sort((a, b) => b.score - a.score);

      console.log("  Registered tribe scores (submitted on chain):");
      for (const ts of tribeScores) {
        const name = discovered.tribeNames[String(ts.tribeId)] ?? `Tribe ${ts.tribeId}`;
        console.log(`    ${name}: ${ts.score}`);
      }

      const nonParticipantScores = [...allScoreMap.entries()]
        .filter(([tid]) => !registeredTribeIds.has(tid));
      if (nonParticipantScores.length > 0) {
        console.log(`  ${nonParticipantScores.length} non-participant tribe(s) excluded from resolution`);
      }

      const winner = tribeScores[0];
      const runnerUp = tribeScores[1];
      const margin = winner && runnerUp ? winner.score - runnerUp.score : winner?.score ?? 0;
      const isDraw = margin < freshState.winMargin;
      console.log(`  Win margin required: ${freshState.winMargin}, actual margin: ${margin} -> ${isDraw ? "DRAW" : "VICTORY"}`);

      // Build pending_resolution block for scoreboard visibility
      const pendingResolutionBlock = {
        status: "pending" as const,
        finalScores: tribeScores.map((ts) => ({
          tribeId: ts.tribeId,
          name: discovered.tribeNames[String(ts.tribeId)] ?? `Tribe ${ts.tribeId}`,
          points: ts.score,
        })),
        warEndedAtMs: freshState.endedAtMs,
        winMargin: freshState.winMargin,
        actualMargin: margin,
        isDraw,
        attemptedAtMs: Date.now(),
      };

      // Write pending_resolution BEFORE attempting submission
      try {
        const { renameSync } = await import("node:fs");
        const latestRaw = (await import("node:fs")).readFileSync(outputPath, "utf8");
        const latestJson = JSON.parse(latestRaw);
        latestJson.pending_resolution = pendingResolutionBlock;
        const tmpLatestPath = outputPath + ".tmp";
        (await import("node:fs")).writeFileSync(tmpLatestPath, JSON.stringify(latestJson, null, 2) + "\n", "utf8");
        renameSync(tmpLatestPath, outputPath);
        console.log(`  Pending resolution written to latest.json`);
      } catch (err) {
        console.error(`  Warning: Could not write pending_resolution to latest.json: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Attempt resolution with retry
      const resolution = await submitResolveWarWithRetry({
        rpcUrl,
        packageId,
        warId: discovered.warId,
        registryId: discovered.warRegistryId,
        tribeScores,
        adminPrivateKey,
      });

      if (resolution) {
        // Retry succeeded: write full resolution.json and update latest.json
        console.log(`  War resolved on chain! WarResolution: ${resolution.warResolutionObjectId}`);

        const resolutionBlock = {
          warResolutionObjectId: resolution.warResolutionObjectId,
          transactionDigest: resolution.digest,
          winner: winner ? {
            tribeId: winner.tribeId,
            name: discovered.tribeNames[String(winner.tribeId)] ?? `Tribe ${winner.tribeId}`,
            points: winner.score,
          } : null,
          runnerUp: runnerUp ? {
            tribeId: runnerUp.tribeId,
            name: discovered.tribeNames[String(runnerUp.tribeId)] ?? `Tribe ${runnerUp.tribeId}`,
            points: runnerUp.score,
          } : null,
          allScores: tribeScores.map((ts) => ({
            tribeId: ts.tribeId,
            name: discovered.tribeNames[String(ts.tribeId)] ?? `Tribe ${ts.tribeId}`,
            points: ts.score,
          })),
          isDraw,
          winMargin: freshState.winMargin,
          actualMargin: margin,
          endedAtMs: freshState.endedAtMs,
          resolvedAtMs: resolution.resolvedAtMs,
        };

        // Write resolution.json atomically
        const resolutionPath = path.join(path.dirname(outputPath), "resolution.json");
        const { writeFileSync, renameSync, mkdirSync } = await import("node:fs");
        mkdirSync(path.dirname(resolutionPath), { recursive: true });
        const tmpResolutionPath = resolutionPath + ".tmp";
        writeFileSync(tmpResolutionPath, JSON.stringify(resolutionBlock, null, 2) + "\n", "utf8");
        renameSync(tmpResolutionPath, resolutionPath);
        console.log(`  Resolution written to ${resolutionPath}`);

        // Patch latest.json with resolution block and clear pending_resolution
        try {
          const latestRaw = (await import("node:fs")).readFileSync(outputPath, "utf8");
          const latestJson = JSON.parse(latestRaw);
          latestJson.resolution = resolutionBlock;
          delete latestJson.pending_resolution;
          const tmpLatestPath = outputPath + ".tmp";
          writeFileSync(tmpLatestPath, JSON.stringify(latestJson, null, 2) + "\n", "utf8");
          renameSync(tmpLatestPath, outputPath);
        } catch {
          // If patching fails, resolution.json is the fallback
        }
        if (ledger) await ledger.close();

        if (warIdOverride != null) {
          console.log("Goodbye (explicit LINEAGE_WAR_ID set).");
          return;
        }
        console.log("War resolved. Polling for next unresolved war...");
        await pollForNextWar(packageId, rpcUrl, graphqlUrl, outputPath, maxHistory, false);
        return;
      } else {
        // All retries failed — WAR CONTINUES. Do NOT close ledger or exit.
        // The war is still unresolved on chain. Next cycle will re-enter this
        // block and retry resolution. Scores are safe in PostgreSQL.
        console.error("  Resolution attempt failed. Will retry on next tick cycle.");
        console.error("  War continues — scores safe in ledger. On-chain resolution pending.");

        try {
          const { renameSync } = await import("node:fs");
          const latestRaw = (await import("node:fs")).readFileSync(outputPath, "utf8");
          const latestJson = JSON.parse(latestRaw);
          latestJson.pending_resolution = {
            ...pendingResolutionBlock,
            status: "retrying" as const,
            lastAttemptMs: Date.now(),
            message: "On-chain resolution failed, will retry next cycle",
          };
          const tmpLatestPath = outputPath + ".tmp";
          (await import("node:fs")).writeFileSync(tmpLatestPath, JSON.stringify(latestJson, null, 2) + "\n", "utf8");
          renameSync(tmpLatestPath, outputPath);
        } catch (err) {
          console.error(`  Warning: Could not update pending_resolution status: ${err instanceof Error ? err.message : String(err)}`);
        }

        // Schedule next cycle — will re-detect ended war and retry resolution
        scheduleNext();
        return;
      }
    }

    if (!freshState.enabled) {
      runtimeStatus.state = "waiting";
      runtimeStatus.nextTickMs = Date.now() + PAUSED_POLL_MS;
      console.log(`War is paused. Polling again in ${formatDuration(PAUSED_POLL_MS)}...`);
      timer = setTimeout(() => {
        void cycle().catch((err) => {
          setLastDiscoveryError("paused_poll_cycle", err);
          console.error("Paused-poll cycle failed:", err);
          timer = setTimeout(() => void cycle(), PAUSED_POLL_MS);
        });
      }, PAUSED_POLL_MS);
      return;
    }

    // Update config if new objects were published
    const configChanged =
      freshState.warConfigIds.length !== currentConfig.chain.warConfigIds.length ||
      freshState.phaseConfigIds.length !== currentConfig.chain.phaseConfigIds.length ||
      freshState.systemConfigIds.length !== currentConfig.chain.systemConfigIds.length;

    if (configChanged) {
      console.log("  Config change detected on chain:");
      if (freshState.warConfigIds.length !== currentConfig.chain.warConfigIds.length) {
        console.log(`    War configs: ${currentConfig.chain.warConfigIds.length} -> ${freshState.warConfigIds.length}`);
      }
      if (freshState.phaseConfigIds.length !== currentConfig.chain.phaseConfigIds.length) {
        console.log(`    Phase configs: ${currentConfig.chain.phaseConfigIds.length} -> ${freshState.phaseConfigIds.length}`);
      }
      if (freshState.systemConfigIds.length !== currentConfig.chain.systemConfigIds.length) {
        console.log(`    System configs: ${currentConfig.chain.systemConfigIds.length} -> ${freshState.systemConfigIds.length}`);
      }
      currentConfig.chain.warConfigIds = freshState.warConfigIds;
      currentConfig.chain.phaseConfigIds = freshState.phaseConfigIds;
      currentConfig.chain.systemConfigIds = freshState.systemConfigIds;
      currentConfig.chain.warSystemIds = freshState.warSystemIds;
    }

    // Check if we have enough configs to run a tick
    const readyToScore = freshState.systemConfigIds.length > 0;

    if (!readyToScore) {
      await writeBootstrapScoreboard(currentConfig, discovered, outputPath, currentTickMinutes);
      refreshPublishedArtifactSummary(outputPath);
      runtimeStatus.state = "waiting";
      runtimeStatus.tickRateMinutes = currentTickMinutes;
      runtimeStatus.lastTickMs = null;
      runtimeStatus.nextTickMs = Date.now() + 60_000;
      console.log("  Bootstrap scoreboard refreshed while waiting for configs.");
      console.log("  Still waiting for configs to be published. Polling again in 1m...");
      timer = setTimeout(() => {
        void cycle().catch((err) => {
          setLastDiscoveryError("config_wait_cycle", err);
          console.error("Poll cycle failed:", err);
          scheduleNext();
        });
      }, 60_000);
      return;
    }

    // Detect tick rate change
    if (freshState.effectiveTickMinutes !== currentTickMinutes) {
      console.log(`  Tick rate changed: ${currentTickMinutes}m -> ${freshState.effectiveTickMinutes}m`);
      currentTickMinutes = freshState.effectiveTickMinutes;
    }

    // Check for missed ticks and catch up
    const now = Date.now();
    const tickMs = currentTickMinutes * 60_000;
    const currentBoundary = alignTick(now, currentTickMinutes);
    const historyCount = Math.min(maxHistory, Math.max(1, Math.floor((now - (currentBoundary - (maxHistory - 1) * tickMs)) / tickMs)));

    const tickOutcome = await runTick(
      currentConfig,
      discovered,
      outputPath,
      currentTickMinutes,
      Math.min(historyCount, maxHistory),
      ledger,
      freshState.endedAtMs,
    );
    runtimeStatus.state = tickOutcome.tickStatus === "degraded_frozen" ? "waiting" : "running";
    runtimeStatus.tickRateMinutes = currentTickMinutes;
    runtimeStatus.lastTickMs = tickOutcome.lastTickMs;
    console.log(`  Scoreboard updated.`);

    scheduleNext();
  };

  scheduleNext();

  activeShutdownHandler = async (): Promise<void> => {
    console.log("\nShutting down verifier loop...");
    if (timer) clearTimeout(timer);
    if (ledger) {
      await ledger.close();
    }
  };

  console.log("\nLive chain verifier loop started. Press Ctrl+C to stop.");
}

async function startHttpServer(
  getStatus: () => Record<string, unknown>,
  verifierArtifactDir: string,
  editorialDisplayPath: string,
): Promise<void> {
  const http = await import("node:http");
  const fs = await import("node:fs");
  const port = envNumber("LINEAGE_VERIFIER_PORT", Number(process.env.PORT) || 3001);

  const adminDistCandidates = [
    path.resolve(process.cwd(), "admin/dist"),
    path.resolve(process.cwd(), "../admin/dist"),
  ];
  const scoreDistCandidates = [
    path.resolve(process.cwd(), "scoreboard/dist"),
    path.resolve(process.cwd(), "../scoreboard/dist"),
  ];
  const adminDist = adminDistCandidates.find((candidate) => fs.existsSync(candidate)) ?? adminDistCandidates[0];
  const scoreDist = scoreDistCandidates.find((candidate) => fs.existsSync(candidate)) ?? scoreDistCandidates[0];
  const hasAdminDist = fs.existsSync(adminDist);
  const hasScoreDist = fs.existsSync(scoreDist);
  if (hasAdminDist) console.log(`  Serving admin panel from ${adminDist}`);
  if (hasScoreDist) console.log(`  Serving scoreboard from ${scoreDist}`);

  const MIME: Record<string, string> = {
    ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
    ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
    ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff",
  };

  const noStoreHeaders = {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };

  function serveStatic(
    baseDir: string,
    urlPath: string,
    res: import("node:http").ServerResponse,
    extraHeaders: Record<string, string> = {},
  ): boolean {
    const safePath = urlPath.replace(/\.\./g, "").replace(/\/+/g, "/");
    let filePath = path.join(baseDir, safePath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(baseDir, "index.html");
    }
    if (!fs.existsSync(filePath)) return false;
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      ...extraHeaders,
    });
    fs.createReadStream(filePath).pipe(res);
    return true;
  }

  function serveVerifierArtifact(urlPath: string, res: import("node:http").ServerResponse): boolean {
    const safePath = urlPath.replace(/^\/verifier\/?/, "").replace(/\.\./g, "").replace(/\/+/g, "/");
    const relativePath = safePath.length > 0 ? safePath : "latest.json";
    const filePath = path.join(verifierArtifactDir, relativePath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      return false;
    }

    const ext = path.extname(filePath);
    const extraHeaders = ext === ".json" ? noStoreHeaders : {};
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      ...extraHeaders,
    });
    fs.createReadStream(filePath).pipe(res);
    return true;
  }

  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || "/", "http://localhost");
    const url = requestUrl.pathname;

    if (req.method === "GET" && url === "/status") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        ...noStoreHeaders,
      });
      res.end(JSON.stringify(getStatus(), null, 2));
      return;
    }

    if (req.method === "GET" && url === "/editorial-display") {
      const warId = Number(requestUrl.searchParams.get("warId"));
      if (!Number.isFinite(warId) || warId <= 0) {
        res.writeHead(400, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          ...noStoreHeaders,
        });
        res.end(JSON.stringify({ ok: false, error: "warId query parameter is required" }));
        return;
      }

      const entries = readEditorialDisplayEntriesForWar(editorialDisplayPath, warId);
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        ...noStoreHeaders,
      });
      res.end(JSON.stringify({ ok: true, warId, count: entries.length, entries }));
      return;
    }

    if (req.method === "POST" && url === "/notify") {
      const bodyChunks: Buffer[] = [];
      console.log(`\n[${new Date().toISOString()}] Received /notify — triggering war re-discovery`);
      req.on("data", (chunk) => bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      req.on("end", () => {
        let payload: { warId?: number; txDigest?: string; reason?: string } = {};
        const raw = Buffer.concat(bodyChunks).toString("utf8").trim();
        if (raw.length > 0) {
          try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            payload = {
              warId: Number.isFinite(Number(parsed.warId)) ? Number(parsed.warId) : undefined,
              txDigest: typeof parsed.txDigest === "string" ? parsed.txDigest : undefined,
              reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
            };
          } catch {
            res.writeHead(400, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
            res.end(JSON.stringify({ ok: false, error: "Invalid JSON body" }));
            return;
          }
        }

        const hint = rememberNotifyHint(payload);
        console.log(
          `\n[${new Date().toISOString()}] Received /notify for war ${hint.warId ?? "auto"} (${hint.reason ?? "unspecified"})`,
        );
        triggerNotify();
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          ...noStoreHeaders,
        });
        res.end(JSON.stringify({ ok: true, message: "Re-discovery triggered", hint }));
      });
      return;
    }

    if (req.method === "POST" && url === "/editorial-display") {
      const bodyChunks: Buffer[] = [];
      req.on("data", (chunk) => bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      req.on("end", async () => {
        type EditorialBody = {
          warId?: unknown;
          phaseId?: unknown;
          effectiveFromMs?: unknown;
          reason?: unknown;
          systems?: Array<{
            systemId?: unknown;
            displayName?: unknown;
            publicRuleText?: unknown;
          }>;
        };

        let payload: EditorialBody = {};
        const raw = Buffer.concat(bodyChunks).toString("utf8").trim();
        if (raw.length > 0) {
          try {
            payload = JSON.parse(raw) as EditorialBody;
          } catch {
            res.writeHead(400, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
            res.end(JSON.stringify({ ok: false, error: "Invalid JSON body" }));
            return;
          }
        }

        const warId = Number(payload.warId);
        const effectiveFromMs = Number(payload.effectiveFromMs);
        const phaseIdRaw = Number(payload.phaseId);
        const systems = Array.isArray(payload.systems) ? payload.systems : [];

        if (!Number.isFinite(warId) || warId <= 0 || !Number.isFinite(effectiveFromMs) || systems.length === 0) {
          res.writeHead(400, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            ...noStoreHeaders,
          });
          res.end(JSON.stringify({ ok: false, error: "warId, effectiveFromMs, and at least one system are required" }));
          return;
        }

        const entries: EditorialDisplayEntry[] = systems
          .map((system) => {
            const systemId = String(system.systemId ?? "").trim();
            if (!systemId) return null;
            const displayName = typeof system.displayName === "string" ? system.displayName.trim() : "";
            const publicRuleText = typeof system.publicRuleText === "string" ? system.publicRuleText.trim() : "";
            return {
              warId,
              phaseId: Number.isFinite(phaseIdRaw) ? phaseIdRaw : null,
              systemId,
              effectiveFromMs,
              updatedAtMs: Date.now(),
              ...(displayName ? { displayName } : {}),
              publicRuleText,
            } satisfies EditorialDisplayEntry;
          })
          .filter((entry): entry is EditorialDisplayEntry => entry !== null);

        if (entries.length === 0) {
          res.writeHead(400, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            ...noStoreHeaders,
          });
          res.end(JSON.stringify({ ok: false, error: "No valid system display entries were provided" }));
          return;
        }

        try {
          await upsertEditorialDisplayEntries(editorialDisplayPath, entries);
          const hint = rememberNotifyHint({
            warId,
            reason: typeof payload.reason === "string" ? payload.reason : "editorial-display",
          });
          console.log(
            `\n[${new Date().toISOString()}] Stored ${entries.length} editorial display entr${entries.length === 1 ? "y" : "ies"} for war ${warId}`,
          );
          triggerNotify();
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            ...noStoreHeaders,
          });
          res.end(JSON.stringify({ ok: true, count: entries.length, hint }));
        } catch (error) {
          res.writeHead(500, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            ...noStoreHeaders,
          });
          res.end(JSON.stringify({ ok: false, error: errorMessage(error) }));
        }
      });
      return;
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    if (req.method === "GET") {
      if (url.startsWith("/verifier")) {
        if (serveVerifierArtifact(url, res)) return;
        res.writeHead(404, { "Content-Type": "application/json", ...noStoreHeaders });
        res.end(JSON.stringify({ error: "Live verifier artifact not found" }));
        return;
      }
      if (hasAdminDist && url.startsWith("/admin")) {
        const subPath = url.slice("/admin".length) || "/";
        if (serveStatic(adminDist, subPath, res)) return;
      }
      if (hasScoreDist) {
        if (serveStatic(scoreDist, url, res)) return;
      }
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`  Verifier HTTP server listening on port ${port}`);
  });
}

async function pollForNextWar(
  packageId: string,
  rpcUrl: string,
  graphqlUrl: string | null,
  outputPath: string,
  maxHistory: number,
  once: boolean,
): Promise<void> {
  if (once) {
    console.log("--once flag set, not waiting for next war.");
    return;
  }

  try {
    await hydrateLatestResolvedWarArtifacts(packageId, rpcUrl, graphqlUrl, outputPath);
  } catch (error) {
    console.error(`  Could not hydrate frozen ended-war artifacts: ${errorMessage(error)}`);
  }

  while (true) {
    runtimeStatus.state = "waiting";
    runtimeStatus.warId = null;
    runtimeStatus.nextTickMs = Date.now() + WAR_POLL_MS;
    console.log(`\nWaiting for new war (notify via POST /notify, or auto-check every ${formatDuration(WAR_POLL_MS)})...`);
    await waitForNotifyOrTimeout(WAR_POLL_MS);

    try {
      const discovered = await discoverPreferredWar(packageId, rpcUrl, currentNotifyHint()?.warId ?? null);
      runtimeDiagnostics.lastDiscoveredWar = summarizeDiscoveredWar(discovered);
      clearLastDiscoveryError();

      if (!discovered.warResolved) {
        console.log(`\nFound unresolved War ${discovered.warId}. Starting verifier loop...`);
        maybeClearNotifyHintForWar(discovered.warId);
        await runWarLoop(discovered, packageId, rpcUrl, graphqlUrl, outputPath, maxHistory, false);
        return;
      }
    } catch (err) {
      setLastDiscoveryError("poll_for_next_war", err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("No unresolved war found")) {
        try {
          await hydrateLatestResolvedWarArtifacts(packageId, rpcUrl, graphqlUrl, outputPath);
        } catch (error) {
          console.error(`  Could not refresh frozen ended-war artifacts: ${errorMessage(error)}`);
        }
        console.log("  No unresolved wars found. Will retry...");
      } else {
        console.error("  Poll error:", msg);
      }
    }
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const once = argv.includes("--once");

  const packageId = process.env.LINEAGE_PACKAGE_ID;
  if (!packageId || packageId === "0x0") {
    throw new Error("LINEAGE_PACKAGE_ID must be set in .env");
  }

  const rpcUrl = envString("LINEAGE_SUI_RPC", getJsonRpcFullnodeUrl("testnet"));
  const graphqlUrl = process.env.LINEAGE_SUI_GRAPHQL_URL || null;
  const warIdOverride = process.env.LINEAGE_WAR_ID ? Number(process.env.LINEAGE_WAR_ID) : null;
  const outputPath = process.env.LINEAGE_OUTPUT_PATH
    || defaultRuntimeOutputPath();
  const maxHistory = envNumber("LINEAGE_MAX_HISTORY_TICKS", MAX_CATCHUP_TICKS);
  runtimeDiagnostics.configured = {
    packageId,
    packageIdLooksValid: looksLikePackageId(packageId),
    rpcUrl,
    graphqlUrl,
    warIdOverride: Number.isFinite(warIdOverride) ? warIdOverride : null,
    outputPath,
    editorialDisplayPath: editorialDisplayPathForOutput(outputPath),
  };
  refreshPublishedArtifactSummary(outputPath);
  console.log(
    `[verifier] Config package=${packageId} valid=${runtimeDiagnostics.configured.packageIdLooksValid} `
    + `rpc=${rpcUrl} graphql=${graphqlUrl ?? "off"} output=${outputPath}`,
  );
  if (!runtimeDiagnostics.configured.packageIdLooksValid) {
    console.warn(`[verifier] LINEAGE_PACKAGE_ID does not look like a 32-byte object id: ${packageId}`);
  }

  ensureSignalHandlers();

  if (!once) {
    await startHttpServer(() => ({
      state: runtimeStatus.state,
      warId: runtimeStatus.warId,
      tickRateMinutes: runtimeStatus.tickRateMinutes,
      lastTickMs: runtimeStatus.lastTickMs,
      nextTickMs: runtimeStatus.nextTickMs,
      now: Date.now(),
      notifyHint: currentNotifyHint(),
      diagnostics: runtimeDiagnostics,
    }), path.dirname(outputPath), editorialDisplayPathForOutput(outputPath));
  }

  console.log("Discovering war configuration from chain...");

  try {
    const discovered = warIdOverride && Number.isFinite(warIdOverride)
      ? await discoverWarConfig({
        packageId,
        rpcUrl,
        warId: warIdOverride,
      })
      : await discoverPreferredWar(packageId, rpcUrl, currentNotifyHint()?.warId ?? null);

    runtimeDiagnostics.lastDiscoveredWar = summarizeDiscoveredWar(discovered);
    clearLastDiscoveryError();
    runtimeStatus.warId = discovered.warId;
    runtimeStatus.tickRateMinutes = discovered.defaultTickMinutes;
    runtimeStatus.state = "running";
    maybeClearNotifyHintForWar(discovered.warId);

    await runWarLoop(discovered, packageId, rpcUrl, graphqlUrl, outputPath, maxHistory, once, warIdOverride);
  } catch (err) {
    setLastDiscoveryError("main_startup", err);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("No unresolved war found") && warIdOverride == null) {
      console.log("No unresolved wars found on chain.");
    } else {
      console.error("War discovery/loop failed:", msg);
      if (err instanceof Error && err.stack) console.error(err.stack);
    }
    runtimeStatus.state = "waiting";
    runtimeStatus.warId = null;
    runtimeStatus.nextTickMs = Date.now() + WAR_POLL_MS;
    await pollForNextWar(packageId, rpcUrl, graphqlUrl, outputPath, maxHistory, once);
  }
}

main().catch((error: unknown) => {
  console.error("Live chain verifier loop failed fatally.");
  console.error(error);
  process.exit(1);
});
