import { hashCanonicalSnapshot } from "./hash.js";
import {
  AssemblyRule,
  CandidateAssembly,
  CanonicalSnapshot,
  EffectiveSystemConfig,
  PointAward,
  PresenceAssemblyExplanation,
  PresenceRow,
  ResolvedTickResult,
  SnapshotCommitment,
  SystemResolution,
  TickPlanEntry,
  VerifierDataSource,
} from "./types.js";

function effectiveTickMinutes(
  warTickMinutes: number,
  phaseTickMinutes: number | null,
  systemTickMinutes: number | null,
): number {
  return systemTickMinutes ?? phaseTickMinutes ?? warTickMinutes;
}

async function getEffectiveSystemConfig(
  dataSource: VerifierDataSource,
  systemId: number,
  tickTimestampMs: number,
): Promise<EffectiveSystemConfig> {
  const warConfig = await dataSource.getWarConfigAt(tickTimestampMs);
  const phase = await dataSource.getActivePhaseAt(tickTimestampMs);
  const systemConfig = await dataSource.getSystemConfigAt(systemId, tickTimestampMs);

  return {
    warConfigObjectId: warConfig.objectId,
    phaseObjectId: phase?.objectId ?? null,
    systemConfigObjectId: systemConfig.objectId,
    warConfigVersion: warConfig.version,
    phaseId: phase?.phaseId ?? null,
    systemConfigVersion: systemConfig.version,
    systemId,
    pointsPerTick: systemConfig.pointsPerTick * (phase?.pointsMultiplierBps ?? 10_000) / 10_000,
    tickMinutes: effectiveTickMinutes(
      warConfig.defaultTickMinutes,
      phase?.tickMinutesOverride ?? null,
      systemConfig.tickMinutesOverride,
    ),
    takeMargin: systemConfig.takeMargin || warConfig.defaultTakeMargin,
    holdMargin: systemConfig.holdMargin || warConfig.defaultHoldMargin,
    neutralMinTotalPresence:
      systemConfig.neutralMinTotalPresence || warConfig.defaultNeutralMinTotalPresence,
    contestedWhenTied: systemConfig.contestedWhenTied,
    allowedAssemblyFamilies: systemConfig.allowedAssemblyFamilies,
    allowedAssemblyTypeIds: systemConfig.allowedAssemblyTypeIds,
    allowedStorageTypeIds: systemConfig.allowedStorageTypeIds,
    storageRequirementMode: systemConfig.storageRequirementMode,
    requiredItemTypeIds: systemConfig.requiredItemTypeIds,
    minimumTotalItemCount: systemConfig.minimumTotalItemCount,
    assemblyRules: systemConfig.assemblyRules,
  };
}

function statusPasses(assembly: CandidateAssembly): boolean {
  return assembly.status === "ONLINE";
}

function familyPasses(assembly: CandidateAssembly, cfg: EffectiveSystemConfig): boolean {
  return cfg.allowedAssemblyFamilies.includes(assembly.assemblyFamily);
}

function typePasses(assembly: CandidateAssembly, cfg: EffectiveSystemConfig): boolean {
  if (cfg.allowedAssemblyTypeIds.length === 0) {
    return true;
  }
  return cfg.allowedAssemblyTypeIds.includes(assembly.assemblyTypeId);
}

function storageTypePasses(assembly: CandidateAssembly, cfg: EffectiveSystemConfig): boolean {
  if (assembly.assemblyFamily !== "smart_storage_unit") {
    return true;
  }
  if (cfg.allowedStorageTypeIds.length === 0) {
    return true;
  }
  return assembly.storageTypeId !== null && cfg.allowedStorageTypeIds.includes(assembly.storageTypeId);
}

function storageRulePasses(assembly: CandidateAssembly, cfg: EffectiveSystemConfig): boolean {
  if (assembly.assemblyFamily !== "smart_storage_unit") {
    return true;
  }

  switch (cfg.storageRequirementMode) {
    case "NONE":
      return true;
    case "NON_EMPTY":
      return assembly.inventory.some((entry) => entry.quantity > 0);
    case "SPECIFIC_ITEMS":
      return cfg.requiredItemTypeIds.some((requiredTypeId) =>
        assembly.inventory.some((entry) => entry.itemTypeId === requiredTypeId && entry.quantity > 0),
      );
    case "MINIMUM_TOTAL_QUANTITY":
      return (
        assembly.inventory.reduce((sum, entry) => sum + entry.quantity, 0) >=
        cfg.minimumTotalItemCount
      );
  }
}

function getEffectiveAssemblyRules(cfg: EffectiveSystemConfig): AssemblyRule[] {
  if (cfg.assemblyRules && cfg.assemblyRules.length > 0) {
    return cfg.assemblyRules;
  }
  return [{
    assemblyFamily: cfg.allowedAssemblyFamilies[0] ?? "smart_storage_unit",
    assemblyTypeId: cfg.allowedAssemblyTypeIds.length === 1 ? cfg.allowedAssemblyTypeIds[0] : null,
    storageRequirementMode: cfg.storageRequirementMode,
    requiredItems: cfg.requiredItemTypeIds.map((id) => ({
      itemTypeId: id,
      minimumQuantity: cfg.minimumTotalItemCount > 0 ? cfg.minimumTotalItemCount : 1,
    })),
    presenceWeight: 1,
  }];
}

function assemblyMatchesRule(assembly: CandidateAssembly, rule: AssemblyRule): boolean {
  if (assembly.assemblyFamily !== rule.assemblyFamily) return false;
  if (rule.assemblyTypeId !== null && assembly.assemblyTypeId !== rule.assemblyTypeId) return false;

  if (assembly.assemblyFamily === "smart_storage_unit" && rule.requiredItems.length > 0) {
    for (const req of rule.requiredItems) {
      const held = assembly.inventory.find((e) => e.itemTypeId === req.itemTypeId);
      if (!held || held.quantity < req.minimumQuantity) return false;
    }
  }
  return true;
}

function evaluateAssembly(
  assembly: CandidateAssembly,
  cfg: EffectiveSystemConfig,
): PresenceAssemblyExplanation {
  const base = {
    assemblyId: assembly.assemblyId,
    assemblyFamily: assembly.assemblyFamily,
    assemblyTypeId: assembly.assemblyTypeId,
    status: assembly.status,
  };

  if (!statusPasses(assembly)) {
    return { ...base, countsForPresence: false, presenceWeight: 0, matchedRuleIndex: null, storageRulePassed: false, excludedReason: "assembly_not_online" };
  }

  const rules = getEffectiveAssemblyRules(cfg);

  if (rules.length > 0 && cfg.assemblyRules && cfg.assemblyRules.length > 0) {
    for (let i = 0; i < rules.length; i++) {
      if (assemblyMatchesRule(assembly, rules[i])) {
        return { ...base, countsForPresence: true, presenceWeight: rules[i].presenceWeight, matchedRuleIndex: i, storageRulePassed: true, excludedReason: null };
      }
    }
    return { ...base, countsForPresence: false, presenceWeight: 0, matchedRuleIndex: null, storageRulePassed: false, excludedReason: "no_assembly_rule_matched" };
  }

  if (!familyPasses(assembly, cfg)) {
    return { ...base, countsForPresence: false, presenceWeight: 0, matchedRuleIndex: null, storageRulePassed: false, excludedReason: "assembly_family_not_allowed" };
  }

  if (!typePasses(assembly, cfg)) {
    return { ...base, countsForPresence: false, presenceWeight: 0, matchedRuleIndex: null, storageRulePassed: false, excludedReason: "assembly_type_not_allowed" };
  }

  if (!storageTypePasses(assembly, cfg)) {
    return { ...base, countsForPresence: false, presenceWeight: 0, matchedRuleIndex: null, storageRulePassed: false, excludedReason: "storage_type_not_allowed" };
  }

  const storagePassed = storageRulePasses(assembly, cfg);
  if (!storagePassed) {
    return { ...base, countsForPresence: false, presenceWeight: 0, matchedRuleIndex: null, storageRulePassed: false, excludedReason: "storage_rule_failed" };
  }

  return { ...base, countsForPresence: true, presenceWeight: 1, matchedRuleIndex: 0, storageRulePassed: true, excludedReason: null };
}

function buildPresenceRows(
  warId: number,
  systemId: number,
  tickTimestampMs: number,
  assemblies: CandidateAssembly[],
  cfg: EffectiveSystemConfig,
): PresenceRow[] {
  const byTribe = new Map<number, PresenceAssemblyExplanation[]>();

  for (const assembly of assemblies) {
    const explanation = evaluateAssembly(assembly, cfg);
    const rows = byTribe.get(assembly.tribeId) ?? [];
    rows.push(explanation);
    byTribe.set(assembly.tribeId, rows);
  }

  return [...byTribe.entries()]
    .map(([tribeId, tribeAssemblies]) => {
      const qualifyingAssemblyCount = tribeAssemblies.filter((entry) => entry.countsForPresence).length;
      const presenceScore = tribeAssemblies
        .filter((entry) => entry.countsForPresence)
        .reduce((sum, entry) => sum + entry.presenceWeight, 0);
      return {
        warId,
        systemId,
        tickTimestampMs,
        tribeId,
        presenceScore,
        qualifyingAssemblyCount,
        assemblies: tribeAssemblies.sort((a, b) => a.assemblyId.localeCompare(b.assemblyId)),
      };
    })
    .sort((a, b) => a.tribeId - b.tribeId);
}

function resolveSystem(
  warId: number,
  systemId: number,
  tickTimestampMs: number,
  cfg: EffectiveSystemConfig,
  presenceRows: PresenceRow[],
  previousController: number | null,
): SystemResolution {
  const ranked = [...presenceRows].sort((a, b) => {
    if (b.presenceScore !== a.presenceScore) {
      return b.presenceScore - a.presenceScore;
    }
    return a.tribeId - b.tribeId;
  });

  const top = ranked[0];
  const second = ranked[1];

  if (!top || top.presenceScore < cfg.neutralMinTotalPresence) {
    return {
      warId,
      systemId,
      tickTimestampMs,
      state: "NEUTRAL",
      controllerTribeId: null,
      topTribeId: top?.tribeId ?? null,
      topScore: top?.presenceScore ?? 0,
      secondTribeId: second?.tribeId ?? null,
      secondScore: second?.presenceScore ?? 0,
      requiredMargin: cfg.takeMargin,
      pointsAwarded: 0,
    };
  }

  const secondScore = second?.presenceScore ?? 0;
  const requiredMargin =
    previousController !== null && previousController === top.tribeId
      ? cfg.holdMargin
      : cfg.takeMargin;

  if (top.presenceScore - secondScore < requiredMargin) {
    return {
      warId,
      systemId,
      tickTimestampMs,
      state: "CONTESTED",
      controllerTribeId: null,
      topTribeId: top.tribeId,
      topScore: top.presenceScore,
      secondTribeId: second?.tribeId ?? null,
      secondScore,
      requiredMargin,
      pointsAwarded: 0,
    };
  }

  return {
    warId,
    systemId,
    tickTimestampMs,
    state: "CONTROLLED",
    controllerTribeId: top.tribeId,
    topTribeId: top.tribeId,
    topScore: top.presenceScore,
    secondTribeId: second?.tribeId ?? null,
    secondScore,
    requiredMargin,
    pointsAwarded: cfg.pointsPerTick,
  };
}

function buildPointsAward(resolution: SystemResolution): PointAward[] {
  if (resolution.state !== "CONTROLLED" || resolution.controllerTribeId === null) {
    return [];
  }

  return [
    {
      tribeId: resolution.controllerTribeId,
      points: resolution.pointsAwarded,
    },
  ];
}

function buildSnapshot(
  cfg: EffectiveSystemConfig,
  presenceRows: PresenceRow[],
  resolution: SystemResolution,
): CanonicalSnapshot {
  return {
    snapshotVersion: 1,
    warId: resolution.warId,
    systemId: resolution.systemId,
    tickTimestampMs: resolution.tickTimestampMs,
    state: resolution.state,
    controllerTribeId: resolution.controllerTribeId,
    pointsAwarded: buildPointsAward(resolution),
    config: {
      warConfigObjectId: cfg.warConfigObjectId,
      phaseObjectId: cfg.phaseObjectId,
      systemConfigObjectId: cfg.systemConfigObjectId,
      warConfigVersion: cfg.warConfigVersion,
      phaseId: cfg.phaseId,
      systemConfigVersion: cfg.systemConfigVersion,
    },
    resolution: {
      topTribeId: resolution.topTribeId,
      topScore: resolution.topScore,
      secondTribeId: resolution.secondTribeId,
      secondScore: resolution.secondScore,
      requiredMargin: resolution.requiredMargin,
    },
    presenceRows: presenceRows.map((row) => ({
      tribeId: row.tribeId,
      presenceScore: row.presenceScore,
      qualifyingAssemblyCount: row.qualifyingAssemblyCount,
    })),
    explanation: {
      pointsPerTick: cfg.pointsPerTick,
      allowedAssemblyFamilies: [...cfg.allowedAssemblyFamilies].sort(),
      allowedAssemblyTypeIds: [...cfg.allowedAssemblyTypeIds].sort((a, b) => a - b),
      allowedStorageTypeIds: [...cfg.allowedStorageTypeIds].sort((a, b) => a - b),
      storageRequirementMode: cfg.storageRequirementMode,
      requiredItemTypeIds: [...cfg.requiredItemTypeIds].sort((a, b) => a - b),
      takeMargin: cfg.takeMargin,
      holdMargin: cfg.holdMargin,
    },
  };
}

export async function resolveTick(
  dataSource: VerifierDataSource,
  tick: TickPlanEntry,
): Promise<ResolvedTickResult> {
  const warConfig = await dataSource.getWarConfigAt(tick.tickTimestampMs);
  const cfg = await getEffectiveSystemConfig(dataSource, tick.systemId, tick.tickTimestampMs);
  const assemblies = await dataSource.getCandidateAssemblies(tick.systemId, tick.tickTimestampMs);
  const presenceRows = buildPresenceRows(
    warConfig.warId,
    tick.systemId,
    tick.tickTimestampMs,
    assemblies,
    cfg,
  );
  const previousController = await dataSource.getPreviousController(tick.systemId, tick.tickTimestampMs);
  const resolution = resolveSystem(
    warConfig.warId,
    tick.systemId,
    tick.tickTimestampMs,
    cfg,
    presenceRows,
    previousController,
  );
  const snapshot = buildSnapshot(cfg, presenceRows, resolution);
  const snapshotHash = hashCanonicalSnapshot(snapshot);

  return {
    snapshot,
    commitment: {
      warId: snapshot.warId,
      systemId: snapshot.systemId,
      tickTimestampMs: snapshot.tickTimestampMs,
      state: snapshot.state,
      controllerTribeId: snapshot.controllerTribeId,
      pointsAwarded: snapshot.pointsAwarded.reduce((sum, item) => sum + item.points, 0),
      snapshotHash,
    },
    presenceRows,
    resolution,
    assemblies,
  };
}
