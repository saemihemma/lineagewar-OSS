import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import {
  AuditInputSummary,
  AssemblyFamily,
  AssemblyRule,
  PhaseConfig,
  StorageRequirementMode,
  SystemConfigVersion,
  CandidateAssembly,
  VerifierConfig,
  VerifierDataSource,
  WarConfigVersion,
} from "./types.js";
import { SeededScenarioVerifierDataSource } from "./seeded-source.js";

type MoveFields = Record<string, unknown>;

function toNumber(value: unknown, label: string): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new Error(`Expected numeric field for ${label}`);
}

function toBoolean(value: unknown, label: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  throw new Error(`Expected boolean field for ${label}`);
}

function toOptionalNumber(value: unknown, label: string): number | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "object" && value !== null) {
    const raw = value as { vec?: unknown[] };
    if (Array.isArray(raw.vec)) {
      if (raw.vec.length === 0) {
        return null;
      }
      return toNumber(raw.vec[0], label);
    }
  }
  return toNumber(value, label);
}

function sourceOfTruthModeFromU8(mode: number): WarConfigVersion["sourceOfTruthMode"] {
  if (mode === 0) return "ON_CHAIN_ONLY";
  if (mode === 1) return "PREFER_ON_CHAIN_FALLBACK_WORLD_API";
  if (mode === 2) return "VERIFIER_REQUIRED";
  return "TRUSTED_PUBLISHER_FALLBACK";
}

function storageRequirementModeFromU8(mode: number): StorageRequirementMode {
  if (mode === 0) return "NONE";
  if (mode === 1) return "NON_EMPTY";
  if (mode === 2) return "SPECIFIC_ITEMS";
  return "MINIMUM_TOTAL_QUANTITY";
}

function assemblyFamilyFromU8(family: number): AssemblyFamily {
  if (family === 0) return "smart_storage_unit";
  if (family === 1) return "smart_gate";
  if (family === 2) return "smart_turret";
  return "other";
}

function isActiveAt(timestampMs: number, effectiveFromMs: number, effectiveUntilMs: number | null): boolean {
  return timestampMs >= effectiveFromMs && (effectiveUntilMs == null || timestampMs < effectiveUntilMs);
}

function pickEffectiveConfig<T extends { effectiveFromMs: number; effectiveUntilMs: number | null }>(
  entries: T[],
  timestampMs: number,
): T {
  const active = entries.filter((entry) =>
    isActiveAt(timestampMs, entry.effectiveFromMs, entry.effectiveUntilMs),
  );
  if (active.length > 0) {
    active.sort((a, b) => b.effectiveFromMs - a.effectiveFromMs);
    return active[0];
  }
  const sorted = [...entries].sort((a, b) => a.effectiveFromMs - b.effectiveFromMs);
  if (sorted.length > 0 && timestampMs < sorted[0].effectiveFromMs) {
    return sorted[0];
  }
  throw new Error(`No active config found for timestamp ${timestampMs}`);
}

export class OnChainConfigVerifierDataSource implements VerifierDataSource {
  readonly scenario: SeededScenarioVerifierDataSource["scenario"];
  protected readonly client: SuiJsonRpcClient;

  protected readonly seededFallback: SeededScenarioVerifierDataSource;
  private warConfigCache: WarConfigVersion[] | null = null;
  private phaseConfigCache: PhaseConfig[] | null = null;
  private systemConfigCache: SystemConfigVersion[] | null = null;
  private registryModeCache: number | null = null;

  constructor(
    protected readonly config: VerifierConfig,
  ) {
    this.seededFallback = new SeededScenarioVerifierDataSource(config.tickStartMs, config.scenario);
    this.scenario = this.seededFallback.scenario;
    this.client = new SuiJsonRpcClient({
      url: config.chain.rpcUrl,
      network: "testnet",
    });
  }

  async getWarConfigAt(timestampMs: number): Promise<WarConfigVersion> {
    if (this.registryModeCache === null) {
      this.registryModeCache = this.config.chain.warRegistryId
        ? await this.fetchRegistrySourceOfTruthMode(this.config.chain.warRegistryId)
        : 1;
    }

    const configs = await this.fetchAllWarConfigs();
    if (configs.length === 0) {
      return {
        warId: this.config.warId,
        version: 1,
        defaultTickMinutes: 60,
        defaultPointsPerTick: 1,
        defaultTakeMargin: 1,
        defaultHoldMargin: 1,
        defaultNeutralMinTotalPresence: 0,
        defaultContestedWhenTied: true,
        sourceOfTruthMode: sourceOfTruthModeFromU8(this.registryModeCache),
        effectiveFromMs: 0,
        effectiveUntilMs: null,
      };
    }

    return {
      ...pickEffectiveConfig(configs, timestampMs),
      sourceOfTruthMode: sourceOfTruthModeFromU8(this.registryModeCache),
    };
  }

  private async fetchAllWarConfigs(): Promise<WarConfigVersion[]> {
    if (this.warConfigCache) return this.warConfigCache;
    const ids = [...new Set(this.config.chain.warConfigIds)];
    if (ids.length === 0) { this.warConfigCache = []; return []; }
    const responses = await this.client.multiGetObjects({ ids, options: { showContent: true } });
    this.warConfigCache = responses.map((response, i) => {
      const fields = this.extractResponseFields(response, ids[i]);
      return {
        objectId: ids[i],
        warId: toNumber(fields.war_id, "WarConfigVersion.war_id"),
        version: toNumber(fields.version, "WarConfigVersion.version"),
        defaultTickMinutes: toNumber(fields.default_tick_minutes, "WarConfigVersion.default_tick_minutes"),
        defaultPointsPerTick: toNumber(fields.default_points_per_tick, "WarConfigVersion.default_points_per_tick"),
        defaultTakeMargin: toNumber(fields.default_take_margin, "WarConfigVersion.default_take_margin"),
        defaultHoldMargin: toNumber(fields.default_hold_margin, "WarConfigVersion.default_hold_margin"),
        defaultNeutralMinTotalPresence: toNumber(
          fields.default_neutral_min_total_presence, "WarConfigVersion.default_neutral_min_total_presence",
        ),
        defaultContestedWhenTied: toBoolean(
          fields.default_contested_when_tied, "WarConfigVersion.default_contested_when_tied",
        ),
        sourceOfTruthMode: "PREFER_ON_CHAIN_FALLBACK_WORLD_API" as const,
        effectiveFromMs: toNumber(fields.effective_from_ms, "WarConfigVersion.effective_from_ms"),
        effectiveUntilMs: toOptionalNumber(fields.effective_until_ms, "WarConfigVersion.effective_until_ms"),
      };
    });
    return this.warConfigCache;
  }

  private async fetchAllPhaseConfigs(): Promise<PhaseConfig[]> {
    if (this.phaseConfigCache) return this.phaseConfigCache;
    const ids = [...new Set(this.config.chain.phaseConfigIds)];
    if (ids.length === 0) { this.phaseConfigCache = []; return []; }
    const responses = await this.client.multiGetObjects({ ids, options: { showContent: true } });
    this.phaseConfigCache = responses.map((response, i) => {
      const fields = this.extractResponseFields(response, ids[i]);
      return {
        objectId: ids[i],
        warId: toNumber(fields.war_id, "PhaseConfig.war_id"),
        phaseId: toNumber(fields.phase_id, "PhaseConfig.phase_id"),
        displayName: String(fields.display_name),
        activeSystemIds: [] as number[],
        tickMinutesOverride: toOptionalNumber(fields.tick_minutes_override, "PhaseConfig.tick_minutes_override"),
        pointsMultiplierBps: toNumber(fields.points_multiplier_bps, "PhaseConfig.points_multiplier_bps"),
        effectiveFromMs: toNumber(fields.effective_from_ms, "PhaseConfig.effective_from_ms"),
        effectiveUntilMs: toOptionalNumber(fields.effective_until_ms, "PhaseConfig.effective_until_ms"),
      };
    });
    return this.phaseConfigCache;
  }

  private async fetchAllSystemConfigs(): Promise<SystemConfigVersion[]> {
    if (this.systemConfigCache) return this.systemConfigCache;
    const ids = [...new Set(this.config.chain.systemConfigIds)];
    if (ids.length === 0) { this.systemConfigCache = []; return []; }
    const responses = await this.client.multiGetObjects({ ids, options: { showContent: true } });
    const configs: SystemConfigVersion[] = [];
    for (let i = 0; i < responses.length; i++) {
      const fields = this.extractResponseFields(responses[i], ids[i]);
      const dynamicFields = await this.listDynamicFields(ids[i]);
      configs.push({
        objectId: ids[i],
        warId: toNumber(fields.war_id, "SystemConfigVersion.war_id"),
        systemId: toNumber(fields.system_id, "SystemConfigVersion.system_id"),
        version: toNumber(fields.version, "SystemConfigVersion.version"),
        enabled: toBoolean(fields.enabled, "SystemConfigVersion.enabled"),
        pointsPerTick: toNumber(fields.points_per_tick, "SystemConfigVersion.points_per_tick"),
        tickMinutesOverride: toOptionalNumber(fields.tick_minutes_override, "SystemConfigVersion.tick_minutes_override"),
        takeMargin: toNumber(fields.take_margin, "SystemConfigVersion.take_margin"),
        holdMargin: toNumber(fields.hold_margin, "SystemConfigVersion.hold_margin"),
        neutralMinTotalPresence: toNumber(
          fields.neutral_min_total_presence, "SystemConfigVersion.neutral_min_total_presence",
        ),
        contestedWhenTied: toBoolean(fields.contested_when_tied, "SystemConfigVersion.contested_when_tied"),
        allowedAssemblyFamilies: dynamicFields.allowedAssemblyFamilies,
        allowedAssemblyTypeIds: dynamicFields.allowedAssemblyTypeIds,
        allowedStorageTypeIds: dynamicFields.allowedStorageTypeIds,
        storageRequirementMode: storageRequirementModeFromU8(
          toNumber(fields.storage_requirement_mode, "SystemConfigVersion.storage_requirement_mode"),
        ),
        requiredItemTypeIds: dynamicFields.requiredItemTypeIds,
        minimumTotalItemCount: toNumber(
          fields.minimum_total_item_count, "SystemConfigVersion.minimum_total_item_count",
        ),
        assemblyRules: dynamicFields.assemblyRules.length > 0 ? dynamicFields.assemblyRules : undefined,
        effectiveFromMs: toNumber(fields.effective_from_ms, "SystemConfigVersion.effective_from_ms"),
        effectiveUntilMs: toOptionalNumber(fields.effective_until_ms, "SystemConfigVersion.effective_until_ms"),
      });
    }
    this.systemConfigCache = configs;
    return configs;
  }

  async getActivePhaseAt(timestampMs: number): Promise<PhaseConfig | null> {
    if (this.config.chain.phaseConfigIds.length === 0) {
      const systemConfigs = await this.fetchAllSystemConfigs();
      if (systemConfigs.length === 0) return null;
      const systemIdsFromChain = [...new Set(systemConfigs.map((sc) => sc.systemId))];
      const earliestFromMs = Math.min(...systemConfigs.map((sc) => sc.effectiveFromMs));
      return {
        ...this.seededFallback.scenario.phase,
        activeSystemIds: systemIdsFromChain,
        effectiveFromMs: earliestFromMs,
      };
    }

    const phases = await this.fetchAllPhaseConfigs();
    const effectivePhase = pickEffectiveConfig(phases, timestampMs);

    const allSystemConfigs = await this.fetchAllSystemConfigs();
    const phaseSystemIds = [
      ...new Set(
        allSystemConfigs
          .filter((sc) => isActiveAt(
            effectivePhase.effectiveFromMs,
            sc.effectiveFromMs,
            sc.effectiveUntilMs,
          ))
          .map((sc) => sc.systemId),
      ),
    ];

    return {
      ...effectivePhase,
      activeSystemIds: phaseSystemIds,
    };
  }

  async getSystemConfigAt(systemId: number, timestampMs: number): Promise<SystemConfigVersion> {
    const matchingConfigs = await this.fetchAllSystemConfigs();
    const filtered = matchingConfigs.filter((entry) => entry.systemId === systemId);
    if (filtered.length === 0) {
      throw new Error(`No on-chain SystemConfigVersion configured for system ${systemId}`);
    }
    return pickEffectiveConfig(filtered, timestampMs);
  }

  async getCandidateAssemblies(systemId: number, timestampMs: number): Promise<CandidateAssembly[]> {
    const assemblies = await this.seededFallback.getCandidateAssemblies(systemId, timestampMs);
    return assemblies.map((assembly) => ({
      ...assembly,
      provenance: {
        candidateSource: "seeded_scenario_bootstrap",
        systemSource: "scenario_overlay",
        ownerCharacterSource: "seeded_character",
        tribeSource: "scenario_overlay",
        assemblyMetadataSource: "seeded_world",
        statusSource: assembly.provenance?.statusSource ?? "seeded_default",
        inventorySource: assembly.provenance?.inventorySource ?? "seeded_default",
        locationSource: "scenario_overlay",
      },
    }));
  }

  async getPreviousController(systemId: number, timestampMs: number) {
    return this.seededFallback.getPreviousController(systemId, timestampMs);
  }

  protected getConfiguredActiveSystemIds(): number[] {
    return this.config.chain.activeSystemIds.length > 0
      ? this.config.chain.activeSystemIds
      : this.seededFallback.scenario.phase.activeSystemIds;
  }

  getAuditInputSummary(): AuditInputSummary {
    return {
      candidateCollection: {
        mode: "seeded_scenario_bootstrap",
        detail: this.config.scenario,
      },
      activeSystems: {
        mode: this.config.chain.activeSystemIds.length > 0 ? "declared_active_system_ids" : "scenario_phase_bootstrap",
        detail:
          this.config.chain.activeSystemIds.length > 0
            ? this.config.chain.activeSystemIds.join(",")
            : this.seededFallback.scenario.phase.displayName,
      },
      ownerResolution: {
        mode: "scenario_overlay",
        detail: "tribe ids still come from seeded scenario in chain mode",
      },
      locationResolution: {
        mode: "scenario_overlay",
        detail: "system ids still come from seeded scenario in chain mode",
      },
    };
  }

  private extractResponseFields(response: { data?: { content?: unknown } | null }, objectId: string): MoveFields {
    const content = response.data?.content;
    if (!content || typeof content !== "object" || !("fields" in content)) {
      throw new Error(`Object ${objectId} did not return Move fields`);
    }
    return (content as { fields: MoveFields }).fields;
  }

  private async fetchRegistrySourceOfTruthMode(objectId: string): Promise<number> {
    const response = await this.client.getObject({ id: objectId, options: { showContent: true } });
    const fields = this.extractResponseFields(response, objectId);
    return toNumber(fields.source_of_truth_mode, "WarRegistry.source_of_truth_mode");
  }

  private async listDynamicFields(parentId: string): Promise<{
    allowedAssemblyFamilies: AssemblyFamily[];
    allowedAssemblyTypeIds: number[];
    allowedStorageTypeIds: number[];
    requiredItemTypeIds: number[];
    assemblyRules: AssemblyRule[];
  }> {
    const allowedAssemblyFamilies: AssemblyFamily[] = [];
    const allowedAssemblyTypeIds: number[] = [];
    const allowedStorageTypeIds: number[] = [];
    const requiredItemTypeIds: number[] = [];
    const assemblyRules: AssemblyRule[] = [];
    let cursor: string | null = null;

    do {
      const page = await this.client.getDynamicFields({
        parentId,
        cursor,
      });
      for (const entry of page.data) {
        const nameType = entry.name.type;
        const value = entry.name.value as Record<string, unknown>;
        if (nameType.includes("AllowedAssemblyFamilyKey")) {
          const family = assemblyFamilyFromU8(toNumber(value.family, "AllowedAssemblyFamilyKey.family"));
          const weight = value.weight != null ? toNumber(value.weight, "AllowedAssemblyFamilyKey.weight") : 1;
          allowedAssemblyFamilies.push(family);
          assemblyRules.push({
            assemblyFamily: family,
            assemblyTypeId: null,
            storageRequirementMode: "NONE",
            requiredItems: [],
            presenceWeight: weight,
          });
        } else if (nameType.includes("AllowedAssemblyTypeKey")) {
          const typeId = toNumber(value.type_id, "AllowedAssemblyTypeKey.type_id");
          const weight = value.weight != null ? toNumber(value.weight, "AllowedAssemblyTypeKey.weight") : 1;
          allowedAssemblyTypeIds.push(typeId);
          assemblyRules.push({
            assemblyFamily: "other",
            assemblyTypeId: typeId,
            storageRequirementMode: "NONE",
            requiredItems: [],
            presenceWeight: weight,
          });
        } else if (nameType.includes("AllowedStorageTypeKey")) {
          allowedStorageTypeIds.push(toNumber(value.type_id, "AllowedStorageTypeKey.type_id"));
        } else if (nameType.includes("RequiredItemTypeKey")) {
          requiredItemTypeIds.push(toNumber(value.type_id, "RequiredItemTypeKey.type_id"));
        }
      }
      cursor = page.hasNextPage ? page.nextCursor : null;
    } while (cursor);

    return {
      allowedAssemblyFamilies: [...new Set(allowedAssemblyFamilies)].sort(),
      allowedAssemblyTypeIds: [...new Set(allowedAssemblyTypeIds)].sort((a, b) => a - b),
      allowedStorageTypeIds: [...new Set(allowedStorageTypeIds)].sort((a, b) => a - b),
      requiredItemTypeIds: [...new Set(requiredItemTypeIds)].sort((a, b) => a - b),
      assemblyRules,
    };
  }
}
