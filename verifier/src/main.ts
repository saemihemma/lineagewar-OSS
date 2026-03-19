import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildAuditSummary, writeVerifierArtifacts } from "./artifact-output.js";
import { OnChainConfigVerifierDataSource } from "./chain-source.js";
import { loadVerifierConfig } from "./config.js";
import { buildScoreboardPayload } from "./frontend-output.js";
import { MockVerifierDataSource } from "./mock-source.js";
import { RegistryBackedVerifierDataSource } from "./registry-source.js";
import { resolveTick } from "./resolver.js";
import { SeededScenarioVerifierDataSource } from "./seeded-source.js";
import { loadSystemDisplayConfigs } from "./system-display-config.js";
import { buildTickPlan } from "./tick-planner.js";

async function main(): Promise<void> {
  const config = loadVerifierConfig(process.argv.slice(2));
  const seededDataSource =
    config.source === "seeded"
      ? new SeededScenarioVerifierDataSource(config.tickStartMs, config.scenario)
      : null;
  const chainDataSource =
    config.source === "chain" ? new OnChainConfigVerifierDataSource(config) : null;
  const registryDataSource =
    config.source === "registry" ? new RegistryBackedVerifierDataSource(config) : null;

  if (registryDataSource) {
    if (config.chain.locationQueryMode !== "off") {
      const added = await registryDataSource.refreshLocationMappingsFromEvents();
      if (added > 0) {
        console.log(`Location events: added ${added} new assembly-to-system mappings`);
      }
    }
    registryDataSource.promoteDiscoveredAssemblyIds();
    if (config.chain.assemblyDiscoveryMode !== "off") {
      const discovered = await registryDataSource.discoverAssembliesFromChain();
      if (discovered > 0) {
        console.log(`Assembly discovery: found ${discovered} assemblies on chain`);
      }
    }
    const worldApiBase = process.env.LINEAGE_WORLD_API_BASE;
    if (worldApiBase) {
      await registryDataSource.enrichTribeNamesFromWorldApi(worldApiBase);
    }
  }

  const dataSource = registryDataSource ?? chainDataSource ?? seededDataSource ?? new MockVerifierDataSource();
  const auditInputs =
    dataSource.getAuditInputSummary?.() ?? {
      candidateCollection: { mode: config.source },
      activeSystems: { mode: "unknown" },
      ownerResolution: { mode: "unknown" },
      locationResolution: { mode: "unknown" },
    };
  const tickPlan = await buildTickPlan(
    dataSource,
    config.tickStartMs,
    config.tickCount,
  );
  const systemDisplayConfigs = loadSystemDisplayConfigs(
    config.systemDisplayConfigPath,
    process.env.LINEAGE_SYSTEM_NAMES_PATH ?? null,
  );

  const resolved = [];
  for (const tick of tickPlan) {
    resolved.push(await resolveTick(dataSource, tick));
  }

  const payload =
    registryDataSource || chainDataSource || seededDataSource
      ? buildScoreboardPayload(
          (registryDataSource ?? chainDataSource ?? seededDataSource)!.scenario,
          resolved.map((entry) => entry.snapshot),
          resolved.map((entry) => entry.commitment),
          registryDataSource?.getTribeNameMap(),
        )
      : null;
  const envelope = {
    config: {
      ...config,
      phaseEndMs: config.phaseEndMs ?? undefined,
      phaseLabel: config.phaseLabel ?? undefined,
      warEndMs: config.warEndMs ?? undefined,
    },
    tickPlan,
    commitments: resolved.map((entry) => entry.commitment),
    snapshots: resolved.map((entry) => entry.snapshot),
    scoreboard: payload,
    systemDisplayConfigs,
  };
  let auditSummary = buildAuditSummary(config.outputPath, config.source, auditInputs);

  if (config.outputPath) {
    auditSummary = await writeVerifierArtifacts(config.outputPath, envelope, config.source, auditInputs, resolved);
  }

  if (config.outputJson) {
    console.log(
      JSON.stringify(
        {
          ...envelope,
          audit: auditSummary,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log("Lineage War verifier demo");
  console.log("");
  console.log(`War ID: ${config.warId}`);
  console.log(`Ticks planned: ${tickPlan.length}`);
  console.log(`Source: ${config.source}`);
  if (config.source === "seeded" || config.source === "chain" || config.source === "registry") {
    console.log(`Scenario: ${config.scenario}`);
  }
  if (config.source === "chain" || config.source === "registry") {
    console.log(`RPC: ${config.chain.rpcUrl}`);
    console.log(`WarRegistry: ${config.chain.warRegistryId ?? "unset"}`);
  }
  if (config.source === "registry") {
    console.log(`Assembly registry: ${config.chain.assemblyRegistryPath ?? "unset"}`);
    console.log(`Owner tribe registry: ${config.chain.ownerTribeRegistryPath ?? "unset"}`);
    console.log(`Location mapping: ${config.chain.locationMappingPath ?? "unset"}`);
    console.log(
      `Participating tribes: ${
        config.chain.participatingTribeIds.length > 0
          ? config.chain.participatingTribeIds.join(",")
          : "unset"
      }`,
    );
  }
  if (config.outputPath) {
    console.log(`Wrote scoreboard payload to ${config.outputPath}`);
    console.log(`Audit index: ${auditSummary.indexPath ?? "not written"}`);
    console.log(`Latest tick artifact: ${auditSummary.latestTickArtifactPath ?? "not written"}`);
    if (config.systemDisplayConfigPath) {
      console.log(`System display copy: ${config.systemDisplayConfigPath}`);
    }
  }
  console.log("");

  for (const entry of resolved) {
    const { commitment, resolution } = entry;
    console.log(
      [
        `System ${commitment.systemId}`,
        `tick ${new Date(commitment.tickTimestampMs).toISOString()}`,
        `state=${resolution.state}`,
        `controller=${resolution.controllerTribeId ?? "none"}`,
        `points=${commitment.pointsAwarded}`,
        `hash=${commitment.snapshotHash}`,
      ].join(" | "),
    );
  }
}

main().catch((error: unknown) => {
  console.error("Verifier demo failed.");
  console.error(error);
  process.exit(1);
});
