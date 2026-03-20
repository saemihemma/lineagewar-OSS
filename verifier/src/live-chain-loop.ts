console.log(`[verifier] Starting... (pid=${process.pid}, node=${process.version}, PORT=${process.env.PORT || "unset"})`);

import "dotenv/config";
import path from "node:path";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { buildAuditSummary, writeVerifierArtifacts } from "./artifact-output.js";
import { buildScoreboardPayload } from "./frontend-output.js";
import { submitResolveWarWithRetry, type ResolutionResult } from "./on-chain-resolve.js";
import { RegistryBackedVerifierDataSource } from "./registry-source.js";
import { resolveTick } from "./resolver.js";
import { loadSystemDisplayConfigs } from "./system-display-config.js";
import { TickLedger, type CommittedTick } from "./tick-ledger.js";
import { buildTickPlan } from "./tick-planner.js";
import { discoverWarConfig, refreshWarState, type DiscoveredWarConfig } from "./discover-war-config.js";
import type { ResolvedTickResult, VerifierConfig } from "./types.js";

console.log(`[verifier] All modules loaded successfully.`);

const PAUSED_POLL_MS = 5 * 60_000;
const TICK_BUFFER_MS = 30_000;
const MAX_CATCHUP_TICKS = 48;

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
    phaseEndMs: null,
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

async function runTick(
  config: VerifierConfig,
  discovered: DiscoveredWarConfig,
  outputPath: string,
  tickMinutes: number,
  historicalTickCount: number,
  ledger: TickLedger | null,
  warEndMs?: number | null,
): Promise<ResolvedTickResult[]> {
  const now = Date.now();
  const tickMs = tickMinutes * 60_000;
  const currentTickBoundary = alignTick(now, tickMinutes);
  const tickStartMs = currentTickBoundary - Math.max(0, historicalTickCount - 1) * tickMs;

  config.tickStartMs = tickStartMs;
  config.tickCount = historicalTickCount;

  const dataSource = new RegistryBackedVerifierDataSource(config);

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

  const tickPlan = await buildTickPlan(dataSource, tickStartMs, historicalTickCount, warEndMs);
  const systemDisplayConfigs = loadSystemDisplayConfigs(
    config.systemDisplayConfigPath,
    process.env.LINEAGE_SYSTEM_NAMES_PATH ?? null,
  );

  // Load ALL committed ticks from the ledger -- this is the permanent scoring history
  const committedMap = new Map<string, ResolvedTickResult>();
  if (ledger) {
    const committed = await ledger.loadCommittedTicks(config.warId);
    for (const ct of committed) {
      committedMap.set(`${ct.systemId}:${ct.tickTimestampMs}`, ct.resolved);
    }
  }

  // Start with full ledger history -- scores are permanent regardless of tick rate changes
  const resolved: ResolvedTickResult[] = [...committedMap.values()];
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

  // Only resolve NEW ticks from the plan that aren't already in the ledger
  for (const tick of tickPlan) {
    const key = `${tick.systemId}:${tick.tickTimestampMs}`;
    const isCurrentTick = tick.tickTimestampMs === currentTickBoundary;
    const inLedger = committedMap.has(key);

    if (inLedger && !isCurrentTick) {
      continue;
    }

    const result = await resolveTick(dataSource, tick);

    if (inLedger) {
      const idx = resolved.findIndex(
        (r) => r.snapshot.systemId === tick.systemId && r.snapshot.tickTimestampMs === tick.tickTimestampMs,
      );
      if (idx >= 0) resolved[idx] = result;
      else resolved.push(result);
    } else {
      resolved.push(result);
    }

    if (!isCurrentTick && tick.tickTimestampMs < currentTickBoundary && !inLedger) {
      const totalPoints = result.snapshot.pointsAwarded.reduce((sum, a) => sum + a.points, 0);
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
  const payload = buildScoreboardPayload(
    dataSource.scenario,
    resolved.map((e) => e.snapshot),
    resolved.map((e) => e.commitment),
    tribeNameOverrides,
  );

  const envelope = {
    config: {
      source: "live-chain",
      warId: config.warId,
      tickStartMs,
      tickCount: historicalTickCount,
      phaseStatusWithheld: config.phaseStatusWithheld,
    },
    tickPlan,
    commitments: resolved.map((e) => e.commitment),
    snapshots: resolved.map((e) => e.snapshot),
    scoreboard: payload,
    systemDisplayConfigs,
    ...(corrections.length > 0 ? { corrections } : {}),
  };

  await writeVerifierArtifacts(outputPath, envelope, "live-chain", auditInputs, resolved);

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

  return resolved;
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

  if (discovered.warResolved) {
    if (warIdOverride != null) {
      console.log("War is already resolved. Nothing to do (explicit LINEAGE_WAR_ID set).");
      return;
    }
    console.log("War is already resolved. Will poll for next unresolved war...");
    await pollForNextWar(packageId, rpcUrl, graphqlUrl, outputPath, maxHistory, once);
    return;
  }

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
  {
    const tribeScores = discovered.participatingTribeIds.map((id) => ({
      id,
      name: discovered.tribeNames[String(id)] ?? `Tribe ${id}`,
      points: 0,
      color: `var(--tribe-${String.fromCharCode(97 + discovered.participatingTribeIds.indexOf(id))})`,
    }));
    const initialEnvelope = {
      config: { source: "live-chain", warId: discovered.warId, tickStartMs: Date.now(), tickCount: 0, phaseStatusWithheld: false },
      tickPlan: [],
      commitments: [],
      snapshots: [],
      scoreboard: {
        warName: discovered.warDisplayName || `War ${discovered.warId}`,
        lastTickMs: null,
        tickRateMinutes: currentTickMinutes,
        tribeScores,
        systems: [],
        chartData: [],
        chartSeries: tribeScores.map((ts) => ({
          tribeId: ts.id,
          dataKey: `tribe_${ts.id}`,
          name: ts.name,
          color: ts.color,
        })),
        commitments: [],
        snapshots: [],
      },
      systemDisplayConfigs: [],
    };
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(initialEnvelope, null, 2) + "\n", "utf8");
    console.log(`Wrote initial scoreboard for War ${discovered.warId} to ${outputPath}`);
  }

  // Initial tick (only if configs exist)
  if (hasConfigs) {
    console.log(`Running initial tick (up to ${maxHistory} historical ticks)...`);
    await runTick(currentConfig, discovered, outputPath, currentTickMinutes, maxHistory, ledger, discovered.endedAtMs);
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

    console.log(`\nNext tick at ${new Date(nextBoundary).toISOString()} (in ${formatDuration(sleepMs)})`);

    timer = setTimeout(() => {
      void cycle().catch((err) => {
        console.error("Tick cycle failed:", err);
        scheduleNext();
      });
    }, sleepMs);

    waitForRefresh().then(() => {
      if (timer) clearTimeout(timer);
      console.log(`\n[${new Date().toISOString()}] /notify received — running immediate refresh cycle...`);
      void cycle().catch((err) => {
        console.error("Refresh cycle failed:", err);
        scheduleNext();
      });
    });
  };

  const cycle = async (): Promise<void> => {
    console.log(`\n[${new Date().toISOString()}] Running tick cycle...`);

    // Re-check war state and config changes
    const freshState = await refreshWarState({
      packageId,
      rpcUrl,
      warId: discovered.warId,
      warRegistryId: discovered.warRegistryId,
      warConfigIds: discovered.warConfigIds,
      phaseConfigIds: discovered.phaseConfigIds,
    });

    if (freshState.resolved) {
      console.log("War already resolved on chain. Writing final scoreboard.");
      await runTick(currentConfig, discovered, outputPath, currentTickMinutes, maxHistory, ledger, freshState.endedAtMs);
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
      console.log("Final scoreboard written.");

      const adminPrivateKey = process.env.LINEAGE_ADMIN_PRIVATE_KEY;
      if (!adminPrivateKey) {
        console.error("LINEAGE_ADMIN_PRIVATE_KEY not set. Cannot submit resolve_war transaction.");
        console.error("War continues — will retry next cycle. Set env var or resolve manually from admin panel.");
        scheduleNext();
        return;
      }

      const allScoreMap = new Map<number, number>();
      for (const r of finalResults) {
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
      console.log(`War is paused. Polling again in ${formatDuration(PAUSED_POLL_MS)}...`);
      timer = setTimeout(() => {
        void cycle().catch((err) => {
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
      console.log("  Still waiting for configs to be published. Polling again in 1m...");
      timer = setTimeout(() => {
        void cycle().catch((err) => {
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

    await runTick(currentConfig, discovered, outputPath, currentTickMinutes, Math.min(historyCount, maxHistory), ledger, freshState.endedAtMs);
    console.log(`  Scoreboard updated.`);

    scheduleNext();
  };

  scheduleNext();

  const shutdown = (): void => {
    console.log("\nShutting down verifier loop...");
    if (timer) clearTimeout(timer);
    if (ledger) void ledger.close().finally(() => process.exit(0));
    else process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log("\nLive chain verifier loop started. Press Ctrl+C to stop.");
}

const WAR_POLL_MS = 5 * 60_000;

let notifyResolve: (() => void) | null = null;
let refreshResolve: (() => void) | null = null;

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

async function startHttpServer(getStatus: () => Record<string, unknown>): Promise<void> {
  const http = await import("node:http");
  const fs = await import("node:fs");
  const port = envNumber("LINEAGE_VERIFIER_PORT", Number(process.env.PORT) || 3001);

  const adminDist = path.resolve(process.cwd(), "../admin/dist");
  const scoreDist = path.resolve(process.cwd(), "../scoreboard/dist");
  const hasAdminDist = fs.existsSync(adminDist);
  const hasScoreDist = fs.existsSync(scoreDist);
  if (hasAdminDist) console.log(`  Serving admin panel from ${adminDist}`);
  if (hasScoreDist) console.log(`  Serving scoreboard from ${scoreDist}`);

  const MIME: Record<string, string> = {
    ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
    ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
    ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff",
  };

  function serveStatic(baseDir: string, urlPath: string, res: import("node:http").ServerResponse): boolean {
    const safePath = urlPath.replace(/\.\./g, "").replace(/\/+/g, "/");
    let filePath = path.join(baseDir, safePath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(baseDir, "index.html");
    }
    if (!fs.existsSync(filePath)) return false;
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
    return true;
  }

  const server = http.createServer((req, res) => {
    const url = req.url || "/";

    if (req.method === "GET" && url === "/status") {
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(getStatus(), null, 2));
      return;
    }

    if (req.method === "POST" && url === "/notify") {
      console.log(`\n[${new Date().toISOString()}] Received /notify — triggering war re-discovery`);
      triggerNotify();
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ ok: true, message: "Re-discovery triggered" }));
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

  while (true) {
    console.log(`\nWaiting for new war (notify via POST /notify, or auto-check every ${formatDuration(WAR_POLL_MS)})...`);
    await waitForNotifyOrTimeout(WAR_POLL_MS);

    try {
      const discovered = await discoverWarConfig({
        packageId,
        rpcUrl,
        warId: null,
      });

      if (!discovered.warResolved) {
        console.log(`\nFound unresolved War ${discovered.warId}. Starting verifier loop...`);
        const freshGraphqlUrl = process.env.LINEAGE_SUI_GRAPHQL_URL || null;
        const freshOutputPath = process.env.LINEAGE_OUTPUT_PATH
          || path.resolve(process.cwd(), "../scoreboard/public/verifier/latest.json");
        await runWarLoop(discovered, packageId, rpcUrl, freshGraphqlUrl, freshOutputPath, maxHistory, false);
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("No unresolved war found")) {
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
    || path.resolve(process.cwd(), "../scoreboard/public/verifier/latest.json");
  const maxHistory = envNumber("LINEAGE_MAX_HISTORY_TICKS", MAX_CATCHUP_TICKS);

  let currentWarId: number | null = null;
  let currentTickRate = 60;
  let lastTickMs: number | null = null;
  let nextTickMs: number | null = null;
  let verifierState: "discovering" | "running" | "waiting" | "resolved" = "discovering";

  if (!once) {
    await startHttpServer(() => ({
      state: verifierState,
      warId: currentWarId,
      tickRateMinutes: currentTickRate,
      lastTickMs,
      nextTickMs,
      now: Date.now(),
    }));
  }

  console.log("Discovering war configuration from chain...");

  try {
    const discovered = await discoverWarConfig({
      packageId,
      rpcUrl,
      warId: warIdOverride && Number.isFinite(warIdOverride) ? warIdOverride : null,
    });

    currentWarId = discovered.warId;
    currentTickRate = discovered.defaultTickMinutes;
    verifierState = "running";

    await runWarLoop(discovered, packageId, rpcUrl, graphqlUrl, outputPath, maxHistory, once, warIdOverride);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("No unresolved war found") && warIdOverride == null) {
      console.log("No unresolved wars found on chain.");
    } else {
      console.error("War discovery/loop failed:", msg);
      if (err instanceof Error && err.stack) console.error(err.stack);
    }
    verifierState = "waiting";
    await pollForNextWar(packageId, rpcUrl, graphqlUrl, outputPath, maxHistory, once);
  }
}

main().catch((error: unknown) => {
  console.error("Live chain verifier loop failed fatally.");
  console.error(error);
  process.exit(1);
});
