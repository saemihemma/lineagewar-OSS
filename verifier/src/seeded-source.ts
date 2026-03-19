import {
  CandidateAssembly,
  PhaseConfig,
  ScenarioAssemblyOverlay,
  ScenarioTick,
  SeededWorldResources,
  SystemConfigVersion,
  VerifierDataSource,
  VerifierScenario,
  WarConfigVersion,
} from "./types.js";
import {
  buildSeededAssemblyId,
  buildSeededCharacterId,
  loadSeededWorldResources,
  loadVerifierScenario,
} from "./seeded-world.js";

function coerceTimestampToTickIndex(
  timestampMs: number,
  tickStartMs: number,
  tickMinutes: number,
  tickCount: number,
): number {
  const tickDurationMs = tickMinutes * 60_000;
  const rawIndex = Math.floor((timestampMs - tickStartMs) / tickDurationMs);
  return Math.max(0, Math.min(tickCount - 1, rawIndex));
}

export class SeededScenarioVerifierDataSource implements VerifierDataSource {
  readonly resources: SeededWorldResources;
  readonly scenario: VerifierScenario;

  constructor(
    private readonly tickStartMs: number,
    scenarioNameOrScenario: string | VerifierScenario,
  ) {
    this.resources = loadSeededWorldResources();
    this.scenario =
      typeof scenarioNameOrScenario === "string"
        ? loadVerifierScenario(scenarioNameOrScenario)
        : scenarioNameOrScenario;
  }

  async getWarConfigAt(_timestampMs: number): Promise<WarConfigVersion> {
    return this.scenario.warConfig;
  }

  async getActivePhaseAt(_timestampMs: number): Promise<PhaseConfig | null> {
    return this.scenario.phase;
  }

  async getSystemConfigAt(systemId: number, _timestampMs: number): Promise<SystemConfigVersion> {
    const config = this.scenario.systems.find((entry) => entry.systemId === systemId);
    if (!config) {
      throw new Error(`No scenario system config found for system ${systemId}`);
    }
    return config;
  }

  async getCandidateAssemblies(systemId: number, timestampMs: number): Promise<CandidateAssembly[]> {
    return this.materializeTick(timestampMs)
      .assemblies.map((entry) => this.materializeAssembly(entry))
      .filter((entry) => entry.systemId === systemId);
  }

  async getPreviousController(systemId: number, timestampMs: number): Promise<number | null> {
    const tick = this.materializeTick(timestampMs);
    const value = tick.previousControllers[String(systemId)];
    return value === undefined ? null : value;
  }

  private materializeTick(timestampMs: number): ScenarioTick {
    const index = coerceTimestampToTickIndex(
      timestampMs,
      this.tickStartMs,
      this.scenario.warConfig.defaultTickMinutes,
      this.scenario.ticks.length,
    );
    return this.scenario.ticks[index];
  }

  getAuditInputSummary() {
    return {
      candidateCollection: {
        mode: "seeded_scenario",
        detail: this.scenario.name,
      },
      activeSystems: {
        mode: "scenario_phase",
        detail: this.scenario.phase.displayName,
      },
      ownerResolution: {
        mode: "scenario_overlay",
        detail: "tribe ids declared in scenario ticks",
      },
      locationResolution: {
        mode: "scenario_overlay",
        detail: "published solarsystem in scenario overlay when present, otherwise explicit system ids",
      },
    };
  }

  private materializeAssembly(entry: ScenarioAssemblyOverlay): CandidateAssembly {
    const assemblySeed = this.resources.assemblySeeds[entry.seedKey];
    if (!assemblySeed) {
      throw new Error(`Unknown assembly seed '${entry.seedKey}' in scenario '${this.scenario.name}'`);
    }

    const ownerCharacterId = this.resources.characterIds[entry.ownerCharacterKey];
    if (ownerCharacterId == null) {
      throw new Error(
        `Unknown owner character '${entry.ownerCharacterKey}' in scenario '${this.scenario.name}'`,
      );
    }

    const publishedSolarsystem = entry.publishedLocation?.solarsystem ?? null;
    if (
      entry.systemId !== undefined &&
      publishedSolarsystem !== null &&
      entry.systemId !== publishedSolarsystem
    ) {
      throw new Error(
        `Scenario assembly '${entry.seedKey}' in '${this.scenario.name}' has mismatched systemId and publishedLocation.solarsystem`,
      );
    }

    const resolvedSystemId = publishedSolarsystem ?? entry.systemId ?? null;
    if (resolvedSystemId === null) {
      throw new Error(
        `Scenario assembly '${entry.seedKey}' in '${this.scenario.name}' must declare systemId or publishedLocation.solarsystem`,
      );
    }

    return {
      assemblyId: buildSeededAssemblyId(
        entry.seedKey,
        assemblySeed.itemId,
        this.resources.objectIds ?? {},
      ),
      systemId: resolvedSystemId,
      ownerCharacterId: buildSeededCharacterId(entry.ownerCharacterKey, ownerCharacterId),
      tribeId: entry.tribeId,
      assemblyFamily: assemblySeed.assemblyFamily,
      assemblyTypeId: assemblySeed.assemblyTypeId,
      storageTypeId: assemblySeed.storageTypeId,
      status: entry.status ?? "ONLINE",
      inventory: entry.inventory ?? [],
      provenance: {
        candidateSource: "seeded_scenario",
        systemSource: publishedSolarsystem !== null ? "scenario_published_solarsystem" : "scenario_overlay",
        ownerCharacterSource: "seeded_character",
        tribeSource: "scenario_overlay",
        assemblyMetadataSource: "seeded_world",
        statusSource: entry.status ? "scenario_overlay" : "seeded_default",
        inventorySource: entry.inventory ? "scenario_overlay" : "seeded_default",
        locationSource: publishedSolarsystem !== null ? "published_solarsystem" : "scenario_overlay",
      },
    };
  }
}
