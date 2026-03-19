import {
  CandidateAssembly,
  PhaseConfig,
  SystemConfigVersion,
  VerifierDataSource,
  WarConfigVersion,
} from "./types.js";

const warConfig: WarConfigVersion = {
  warId: 1,
  version: 1,
  defaultTickMinutes: 60,
  defaultPointsPerTick: 1,
  defaultTakeMargin: 1,
  defaultHoldMargin: 1,
  defaultNeutralMinTotalPresence: 1,
  defaultContestedWhenTied: true,
  sourceOfTruthMode: "PREFER_ON_CHAIN_FALLBACK_WORLD_API",
  effectiveFromMs: 0,
  effectiveUntilMs: null,
};

const phaseConfig: PhaseConfig = {
  warId: 1,
  phaseId: 1,
  displayName: "Opening Front",
  activeSystemIds: [3001, 3002],
  tickMinutesOverride: null,
  pointsMultiplierBps: 10_000,
  effectiveFromMs: 0,
  effectiveUntilMs: null,
};

const systemConfigs = new Map<number, SystemConfigVersion>([
  [
    3001,
    {
      warId: 1,
      systemId: 3001,
      version: 1,
      enabled: true,
      pointsPerTick: 2,
      tickMinutesOverride: null,
      takeMargin: 1,
      holdMargin: 1,
      neutralMinTotalPresence: 1,
      contestedWhenTied: true,
      allowedAssemblyFamilies: ["smart_storage_unit"],
      allowedAssemblyTypeIds: [31001],
      allowedStorageTypeIds: [31001],
      storageRequirementMode: "SPECIFIC_ITEMS",
      requiredItemTypeIds: [9001],
      minimumTotalItemCount: 0,
      effectiveFromMs: 0,
      effectiveUntilMs: null,
    },
  ],
  [
    3002,
    {
      warId: 1,
      systemId: 3002,
      version: 1,
      enabled: true,
      pointsPerTick: 1,
      tickMinutesOverride: null,
      takeMargin: 1,
      holdMargin: 1,
      neutralMinTotalPresence: 1,
      contestedWhenTied: true,
      allowedAssemblyFamilies: ["smart_gate", "smart_turret"],
      allowedAssemblyTypeIds: [],
      allowedStorageTypeIds: [],
      storageRequirementMode: "NONE",
      requiredItemTypeIds: [],
      minimumTotalItemCount: 0,
      effectiveFromMs: 0,
      effectiveUntilMs: null,
    },
  ],
]);

const assemblies = new Map<number, CandidateAssembly[]>([
  [
    3001,
    [
      {
        assemblyId: "0xaaa",
        systemId: 3001,
        ownerCharacterId: "0xchar-red-1",
        tribeId: 100,
        assemblyFamily: "smart_storage_unit",
        assemblyTypeId: 31001,
        storageTypeId: 31001,
        status: "ONLINE",
        inventory: [{ itemTypeId: 9001, quantity: 500 }],
        provenance: {
          candidateSource: "mock_inline",
          systemSource: "mock_inline",
          ownerCharacterSource: "mock_inline",
          tribeSource: "mock_inline",
          assemblyMetadataSource: "mock_inline",
          statusSource: "mock_inline",
          inventorySource: "mock_inline",
          locationSource: "mock_inline",
        },
      },
      {
        assemblyId: "0xaab",
        systemId: 3001,
        ownerCharacterId: "0xchar-red-2",
        tribeId: 100,
        assemblyFamily: "smart_storage_unit",
        assemblyTypeId: 31001,
        storageTypeId: 31001,
        status: "ONLINE",
        inventory: [{ itemTypeId: 9001, quantity: 120 }],
        provenance: {
          candidateSource: "mock_inline",
          systemSource: "mock_inline",
          ownerCharacterSource: "mock_inline",
          tribeSource: "mock_inline",
          assemblyMetadataSource: "mock_inline",
          statusSource: "mock_inline",
          inventorySource: "mock_inline",
          locationSource: "mock_inline",
        },
      },
      {
        assemblyId: "0xbbb",
        systemId: 3001,
        ownerCharacterId: "0xchar-blue-1",
        tribeId: 200,
        assemblyFamily: "smart_storage_unit",
        assemblyTypeId: 31001,
        storageTypeId: 31001,
        status: "ONLINE",
        inventory: [{ itemTypeId: 7000, quantity: 50 }],
        provenance: {
          candidateSource: "mock_inline",
          systemSource: "mock_inline",
          ownerCharacterSource: "mock_inline",
          tribeSource: "mock_inline",
          assemblyMetadataSource: "mock_inline",
          statusSource: "mock_inline",
          inventorySource: "mock_inline",
          locationSource: "mock_inline",
        },
      },
    ],
  ],
  [
    3002,
    [
      {
        assemblyId: "0xccc",
        systemId: 3002,
        ownerCharacterId: "0xchar-red-3",
        tribeId: 100,
        assemblyFamily: "smart_gate",
        assemblyTypeId: 41001,
        storageTypeId: null,
        status: "ONLINE",
        inventory: [],
        provenance: {
          candidateSource: "mock_inline",
          systemSource: "mock_inline",
          ownerCharacterSource: "mock_inline",
          tribeSource: "mock_inline",
          assemblyMetadataSource: "mock_inline",
          statusSource: "mock_inline",
          inventorySource: "mock_inline",
          locationSource: "mock_inline",
        },
      },
      {
        assemblyId: "0xddd",
        systemId: 3002,
        ownerCharacterId: "0xchar-blue-2",
        tribeId: 200,
        assemblyFamily: "smart_gate",
        assemblyTypeId: 41001,
        storageTypeId: null,
        status: "ONLINE",
        inventory: [],
        provenance: {
          candidateSource: "mock_inline",
          systemSource: "mock_inline",
          ownerCharacterSource: "mock_inline",
          tribeSource: "mock_inline",
          assemblyMetadataSource: "mock_inline",
          statusSource: "mock_inline",
          inventorySource: "mock_inline",
          locationSource: "mock_inline",
        },
      },
    ],
  ],
]);

const previousControllers = new Map<number, number | null>([
  [3001, 100],
  [3002, null],
]);

export class MockVerifierDataSource implements VerifierDataSource {
  async getWarConfigAt(_timestampMs: number): Promise<WarConfigVersion> {
    return warConfig;
  }

  async getActivePhaseAt(_timestampMs: number): Promise<PhaseConfig | null> {
    return phaseConfig;
  }

  async getSystemConfigAt(systemId: number, _timestampMs: number): Promise<SystemConfigVersion> {
    const config = systemConfigs.get(systemId);
    if (!config) {
      throw new Error(`No mock system config found for system ${systemId}`);
    }
    return config;
  }

  async getCandidateAssemblies(systemId: number, _timestampMs: number): Promise<CandidateAssembly[]> {
    return assemblies.get(systemId) ?? [];
  }

  async getPreviousController(systemId: number, _timestampMs: number): Promise<number | null> {
    return previousControllers.get(systemId) ?? null;
  }

  getAuditInputSummary() {
    return {
      candidateCollection: {
        mode: "mock_inline",
        detail: "in-memory mock assemblies",
      },
      activeSystems: {
        mode: "mock_inline",
        detail: "hardcoded phase config",
      },
      ownerResolution: {
        mode: "mock_inline",
        detail: "tribe ids embedded on candidate assemblies",
      },
      locationResolution: {
        mode: "mock_inline",
        detail: "system ids embedded on candidate assemblies",
      },
    };
  }
}
