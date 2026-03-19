export type SourceOfTruthMode =
  | "ON_CHAIN_ONLY"
  | "PREFER_ON_CHAIN_FALLBACK_WORLD_API"
  | "VERIFIER_REQUIRED"
  | "TRUSTED_PUBLISHER_FALLBACK";

export type AssemblyFamily =
  | "smart_storage_unit"
  | "smart_gate"
  | "smart_turret"
  | "other";

export type StorageRequirementMode =
  | "NONE"
  | "NON_EMPTY"
  | "SPECIFIC_ITEMS"
  | "MINIMUM_TOTAL_QUANTITY";

export type ControlState = "NEUTRAL" | "CONTESTED" | "CONTROLLED";

export interface WarConfigVersion {
  objectId?: string;
  warId: number;
  version: number;
  defaultTickMinutes: number;
  defaultPointsPerTick: number;
  defaultTakeMargin: number;
  defaultHoldMargin: number;
  defaultNeutralMinTotalPresence: number;
  defaultContestedWhenTied: boolean;
  sourceOfTruthMode: SourceOfTruthMode;
  effectiveFromMs: number;
  effectiveUntilMs: number | null;
}

export interface PhaseConfig {
  objectId?: string;
  warId: number;
  phaseId: number;
  displayName: string;
  activeSystemIds: number[];
  tickMinutesOverride: number | null;
  pointsMultiplierBps: number;
  effectiveFromMs: number;
  effectiveUntilMs: number | null;
}

export interface SystemConfigVersion {
  objectId?: string;
  warId: number;
  systemId: number;
  version: number;
  enabled: boolean;
  pointsPerTick: number;
  tickMinutesOverride: number | null;
  takeMargin: number;
  holdMargin: number;
  neutralMinTotalPresence: number;
  contestedWhenTied: boolean;
  allowedAssemblyFamilies: AssemblyFamily[];
  allowedAssemblyTypeIds: number[];
  allowedStorageTypeIds: number[];
  storageRequirementMode: StorageRequirementMode;
  requiredItemTypeIds: number[];
  minimumTotalItemCount: number;
  assemblyRules?: AssemblyRule[];
  effectiveFromMs: number;
  effectiveUntilMs: number | null;
}

export interface EffectiveSystemConfig {
  warConfigObjectId?: string;
  phaseObjectId?: string | null;
  systemConfigObjectId?: string;
  warConfigVersion: number;
  phaseId: number | null;
  systemConfigVersion: number;
  systemId: number;
  pointsPerTick: number;
  tickMinutes: number;
  takeMargin: number;
  holdMargin: number;
  neutralMinTotalPresence: number;
  contestedWhenTied: boolean;
  allowedAssemblyFamilies: AssemblyFamily[];
  allowedAssemblyTypeIds: number[];
  allowedStorageTypeIds: number[];
  storageRequirementMode: StorageRequirementMode;
  requiredItemTypeIds: number[];
  minimumTotalItemCount: number;
  assemblyRules?: AssemblyRule[];
}

export interface InventoryEntry {
  itemTypeId: number;
  quantity: number;
}

export interface CandidateAssembly {
  assemblyId: string;
  systemId: number;
  ownerCharacterId: string;
  tribeId: number;
  assemblyFamily: AssemblyFamily;
  assemblyTypeId: number;
  storageTypeId: number | null;
  status: "ONLINE" | "OFFLINE" | "NULL";
  inventory: InventoryEntry[];
  provenance?: CandidateAssemblyProvenance;
}

export interface CandidateAssemblyProvenance {
  candidateSource: string;
  systemSource: string;
  ownerCharacterSource: string;
  tribeSource: string;
  assemblyMetadataSource: string;
  statusSource: string;
  inventorySource: string;
  locationSource?: string | null;
}

export interface PresenceAssemblyExplanation {
  assemblyId: string;
  assemblyFamily: AssemblyFamily;
  assemblyTypeId: number;
  status: CandidateAssembly["status"];
  countsForPresence: boolean;
  presenceWeight: number;
  matchedRuleIndex: number | null;
  storageRulePassed: boolean;
  excludedReason: string | null;
}

export interface PresenceRow {
  warId: number;
  systemId: number;
  tickTimestampMs: number;
  tribeId: number;
  presenceScore: number;
  qualifyingAssemblyCount: number;
  assemblies: PresenceAssemblyExplanation[];
}

export interface SystemResolution {
  warId: number;
  systemId: number;
  tickTimestampMs: number;
  state: ControlState;
  controllerTribeId: number | null;
  topTribeId: number | null;
  topScore: number;
  secondTribeId: number | null;
  secondScore: number;
  requiredMargin: number;
  pointsAwarded: number;
}

export interface PointAward {
  tribeId: number;
  points: number;
}

export interface CanonicalSnapshot {
  snapshotVersion: number;
  warId: number;
  systemId: number;
  tickTimestampMs: number;
  state: ControlState;
  controllerTribeId: number | null;
  pointsAwarded: PointAward[];
  config: {
    warConfigObjectId?: string;
    phaseObjectId?: string | null;
    systemConfigObjectId?: string;
    warConfigVersion: number;
    phaseId: number | null;
    systemConfigVersion: number;
  };
  resolution: {
    topTribeId: number | null;
    topScore: number;
    secondTribeId: number | null;
    secondScore: number;
    requiredMargin: number;
  };
  presenceRows: Array<{
    tribeId: number;
    presenceScore: number;
    qualifyingAssemblyCount: number;
  }>;
  explanation: {
    pointsPerTick: number;
    allowedAssemblyFamilies: AssemblyFamily[];
    allowedAssemblyTypeIds: number[];
    allowedStorageTypeIds: number[];
    storageRequirementMode: StorageRequirementMode;
    requiredItemTypeIds: number[];
    takeMargin: number;
    holdMargin: number;
  };
}

export interface SnapshotCommitment {
  warId: number;
  systemId: number;
  tickTimestampMs: number;
  state: ControlState;
  controllerTribeId: number | null;
  pointsAwarded: number;
  snapshotHash: string;
}

export interface TickPlanEntry {
  tickTimestampMs: number;
  systemId: number;
}

export interface ItemRequirement {
  itemTypeId: number;
  minimumQuantity: number;
}

export interface AssemblyRule {
  assemblyFamily: AssemblyFamily;
  assemblyTypeId: number | null;
  storageRequirementMode: StorageRequirementMode;
  requiredItems: ItemRequirement[];
  presenceWeight: number;
}

export interface VerifierConfig {
  warId: number;
  tickStartMs: number;
  tickCount: number;
  phaseStatusWithheld: boolean;
  phaseEndMs: number | null;
  phaseLabel: string | null;
  warEndMs: number | null;
  outputJson: boolean;
  source: "mock" | "seeded" | "chain" | "registry";
  scenario: string;
  outputPath: string | null;
  systemDisplayConfigPath: string | null;
  chain: {
    rpcUrl: string;
    warRegistryId: string | null;
    warConfigIds: string[];
    phaseConfigIds: string[];
    systemConfigIds: string[];
    activeSystemIds: number[];
    warSystemIds: number[];
    participatingTribeIds: number[];
    packageId: string | null;
    adminCapId: string | null;
    assemblyRegistryPath: string | null;
    assemblyObjectIds: string[];
    ownerTribeRegistryPath: string | null;
    locationMappingPath: string | null;
    assemblySystemMappingPath: string | null;
    graphqlUrl: string | null;
    locationQueryMode: "auto" | "graphql" | "rpc" | "off";
    locationEventType: string | null;
    locationEventsPageSize: number;
    locationEventsMaxPages: number;
    worldPackageId: string | null;
    worldTenant: string | null;
    assemblyDiscoveryMode: "off" | "graphql";
  };
}

export interface VerifierDataSource {
  getWarConfigAt(timestampMs: number): Promise<WarConfigVersion>;
  getActivePhaseAt(timestampMs: number): Promise<PhaseConfig | null>;
  getSystemConfigAt(systemId: number, timestampMs: number): Promise<SystemConfigVersion>;
  getCandidateAssemblies(systemId: number, timestampMs: number): Promise<CandidateAssembly[]>;
  getPreviousController(
    systemId: number,
    timestampMs: number,
  ): Promise<number | null>;
  getAuditInputSummary?(): AuditInputSummary;
}

export interface AuditInputSourceSummary {
  mode: string;
  detail?: string;
  path?: string | null;
  objectCount?: number;
}

export interface AuditInputSummary {
  candidateCollection: AuditInputSourceSummary;
  activeSystems: AuditInputSourceSummary;
  ownerResolution: AuditInputSourceSummary;
  locationResolution: AuditInputSourceSummary;
}

export interface SeededWorldResources {
  locationHash: string;
  characterIds: Record<string, number>;
  assemblySeeds: Record<
    string,
    {
      assemblyFamily: AssemblyFamily;
      assemblyTypeId: number;
      storageTypeId: number | null;
      itemId: number;
    }
  >;
  itemTypeIds: Record<string, number>;
  objectIds?: Partial<Record<string, string>>;
}

export interface LiveAssemblyRegistryEntry {
  objectId: string;
  seedKey?: string | null;
  bootstrapSystemId?: number | null;
  bootstrapLocationHashHex?: string | null;
  bootstrapOwnerCharacterId?: string | null;
  bootstrapStatus?: CandidateAssembly["status"];
  bootstrapInventory?: InventoryEntry[];
  bootstrapAssemblyFamily?: AssemblyFamily;
  bootstrapAssemblyTypeId?: number | null;
  bootstrapStorageTypeId?: number | null;
  // Deprecated aliases kept temporarily so older manifests still load during the LocationRegistry cutover.
  fallbackSystemId?: number | null;
  fallbackLocationHashHex?: string | null;
  fallbackOwnerCharacterId?: string | null;
  fallbackStatus?: CandidateAssembly["status"];
  fallbackInventory?: InventoryEntry[];
  fallbackAssemblyFamily?: AssemblyFamily;
  fallbackAssemblyTypeId?: number | null;
  fallbackStorageTypeId?: number | null;
}

export interface LiveAssemblyRegistryDocument {
  assemblies: LiveAssemblyRegistryEntry[];
}

export interface LocationMappingEntry {
  locationHashHex: string;
  systemId: number;
  systemName?: string;
  note?: string;
}

export interface LocationMappingDocument {
  locations: LocationMappingEntry[];
}

export interface AssemblySystemMappingEntry {
  assemblyId: string;
  systemId: number;
  timestamp?: string;
  txDigest?: string;
  x?: number;
  y?: number;
  z?: number;
}

export interface AssemblySystemMappingDocument {
  assemblies: AssemblySystemMappingEntry[];
}

export interface OwnerTribeRegistryEntry {
  ownerCharacterId: string;
  ownerCharacterObjectId?: string;
  ownerCharacterAddress?: string;
  tribeId: number;
  tribeName?: string;
}

export interface TribeMetadataEntry {
  tribeId: number;
  name?: string;
  note?: string;
}

export interface OwnerTribeRegistryDocument {
  participatingTribeIds?: number[];
  tribes?: TribeMetadataEntry[];
  owners: OwnerTribeRegistryEntry[];
}

export interface ScenarioAssemblyOverlay {
  seedKey: string;
  ownerCharacterKey: string;
  tribeId: number;
  systemId?: number;
  publishedLocation?: {
    solarsystem: number;
    x?: number;
    y?: number;
    z?: number;
  };
  status?: CandidateAssembly["status"];
  inventory?: InventoryEntry[];
}

export interface ScenarioTick {
  tickOffset: number;
  previousControllers: Record<string, number | null>;
  assemblies: ScenarioAssemblyOverlay[];
}

export interface LiveSimulationTemplate {
  id: string;
  displayName: string;
  weightBps: number;
  previousControllers: Record<string, number | null>;
  assemblies: ScenarioAssemblyOverlay[];
}

export interface LiveSimulationConfig {
  emitIntervalSeconds: number;
  initialHistoryTicks: number;
  maxHistoryTicks: number;
  templates: LiveSimulationTemplate[];
}

export interface VerifierScenario {
  name: string;
  warName: string;
  tribeNames: Record<string, string>;
  systemNames: Record<string, string>;
  phase: PhaseConfig;
  warConfig: WarConfigVersion;
  systems: SystemConfigVersion[];
  ticks: ScenarioTick[];
  simulation?: LiveSimulationConfig;
}

export interface SystemDisplayConfig {
  systemId: string;
  // Editorial/public-display only. This must never be treated as scoring authority.
  displayName?: string;
  // Editorial/public-display only. This must never be treated as scoring authority.
  publicRuleText: string;
}

export interface ScoreboardSystem {
  id: string;
  name: string;
  state: number;
  controller?: number;
  pointsPerTick: number;
}

export interface ScoreboardTribeScore {
  id: number;
  name: string;
  points: number;
  color: string;
}

export interface ScoreboardHistoryPoint {
  tick: number;
  timestamp: number;
  [key: string]: number | string;
}

export interface ScoreboardChartSeries {
  tribeId: number;
  dataKey: string;
  name: string;
  color: string;
}

export interface ScoreboardPayload {
  warName: string;
  lastTickMs: number;
  tickRateMinutes?: number;
  tribeScores: ScoreboardTribeScore[];
  systems: ScoreboardSystem[];
  chartData: ScoreboardHistoryPoint[];
  chartSeries: ScoreboardChartSeries[];
  commitments: SnapshotCommitment[];
  snapshots: CanonicalSnapshot[];
}

export interface ResolvedTickResult {
  snapshot: CanonicalSnapshot;
  commitment: SnapshotCommitment;
  presenceRows: PresenceRow[];
  resolution: SystemResolution;
  assemblies: CandidateAssembly[];
}

export interface AuditScoreboardPoint {
  tick: number;
  timestamp: number;
  tribeScores: ScoreboardTribeScore[];
}

export interface TickAuditSystemEntry {
  systemId: number;
  snapshot: CanonicalSnapshot;
  commitment: SnapshotCommitment;
  resolution: SystemResolution;
  presenceRows: PresenceRow[];
  candidateAssemblies: CandidateAssembly[];
  editorialDisplay: SystemDisplayConfig | null;
}

export interface TickAuditArtifact {
  artifactVersion: number;
  generatedAtMs: number;
  verifierVersion: string;
  sourceMode: string;
  tickTimestampMs: number;
  warId: number;
  tickPlan: TickPlanEntry[];
  commitments: SnapshotCommitment[];
  snapshots: CanonicalSnapshot[];
  scoreboard: AuditScoreboardPoint | null;
  inputs: AuditInputSummary;
  systems: TickAuditSystemEntry[];
  receiptPath: string;
}

export interface TickAuditIndexEntry {
  tickTimestampMs: number;
  path: string;
  receiptPath: string;
  systemCount: number;
}

export interface TickAuditIndex {
  artifactVersion: number;
  generatedAtMs: number;
  verifierVersion: string;
  sourceMode: string;
  latestTickMs: number | null;
  availableTicks: TickAuditIndexEntry[];
  trackedSystems: Array<{ id: string; name: string }>;
  latestPath: string | null;
}

export interface VerifierAuditSummary {
  artifactVersion: number;
  generatedAtMs: number;
  verifierVersion: string;
  sourceMode: string;
  indexPath: string | null;
  latestTickArtifactPath: string | null;
  latestReceiptPath: string | null;
  inputs: AuditInputSummary;
}
