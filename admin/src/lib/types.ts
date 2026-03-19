export type ControlState = 0 | 1 | 2;
export type SourceOfTruthMode = 0 | 1 | 2 | 3;
export type StorageRequirementMode = 0 | 1 | 2 | 3;
export type AssemblyFamily = 0 | 1 | 2 | 3;
export type ScheduleTargetKind = 0 | 1 | 2;

export interface WarRegistryFields {
  war_id: string;
  slug: string;
  display_name: string;
  enabled: boolean;
  max_supported_tribes: string;
  source_of_truth_mode: string;
  current_war_config_version: string;
}

export interface WarSystemFields {
  war_id: string;
  system_id: string;
  display_name: string;
  priority_class: string;
  enabled: boolean;
}

export interface SnapshotRecordFields {
  war_id: string;
  system_id: string;
  tick_timestamp_ms: string;
  state: string;
  controller_tribe_id?: string;
  points_awarded: string;
}

export interface OwnedAdminCap {
  objectId: string;
  warId: number | null;
  type: string | null;
}

export interface SystemRuleSet {
  allowedAssemblyFamilies: AssemblyFamily[];
  allowedAssemblyTypeIds: number[];
  allowedStorageTypeIds: number[];
  requiredItemTypeIds: number[];
}

export interface SystemDisplayCopy {
  // Editorial/public-display only. This must never be treated as scoring authority.
  displayRuleLabel: string;
  // Editorial/public-display only. This must never be treated as scoring authority.
  displayRuleDescription: string;
}

export interface CreateWarDraft {
  kind: "create-war";
  warId: number;
  slug: string;
  displayName: string;
  maxSupportedTribes: number;
  sourceOfTruthMode: SourceOfTruthMode;
  createdAtMs: number;
  winMargin: number;
}

export interface PublishDefaultsDraft {
  kind: "publish-defaults";
  warId: number;
  version: number;
  defaultTickMinutes: number;
  defaultPointsPerTick: number;
  defaultTakeMargin: number;
  defaultHoldMargin: number;
  defaultNeutralMinTotalPresence: number;
  defaultContestedWhenTied: boolean;
  defaultStorageRequirementMode: StorageRequirementMode;
  effectiveFromMs: number;
  effectiveUntilMs: number | null;
  adminCapId: string;
  adminCapWarId?: number | null;
}

export interface UpsertSystemConfigDraft {
  kind: "upsert-system-config";
  warId: number;
  systemId: number;
  displayName: string;
  priorityClass: number;
  registerSystem: boolean;
  systemEnabled: boolean;
  version: number;
  pointsPerTick: number;
  tickMinutesOverride: number | null;
  takeMargin: number;
  holdMargin: number;
  neutralMinTotalPresence: number;
  contestedWhenTied: boolean;
  storageRequirementMode: StorageRequirementMode;
  minimumTotalItemCount: number;
  effectiveFromMs: number;
  effectiveUntilMs: number | null;
  adminCapId: string;
  adminCapWarId?: number | null;
  ruleSet: SystemRuleSet;
  displayCopy: SystemDisplayCopy;
}

export interface ScheduleSystemChangeDraft {
  kind: "schedule-system-change";
  warId: number;
  changeId: number;
  targetSystemId: number;
  configObjectId: string;
  effectiveFromMs: number;
  createdAtMs: number;
  adminCapId: string;
  adminCapWarId?: number | null;
  configWarId?: number | null;
  configSystemId?: number | null;
}

export interface ToggleWarDraft {
  kind: "toggle-war";
  action: "pause" | "resume";
  registryId: string;
  warId: number;
  adminCapId: string;
  adminCapWarId?: number | null;
}

export interface CommitSnapshotDraft {
  kind: "commit-snapshot";
  warId: number;
  systemId: number;
  tickTimestampMs: number;
  state: ControlState;
  controllerTribeId: number | null;
  pointsAwarded: number;
  configVersionId: string;
  snapshotHashHex: string;
  adminCapId: string;
  adminCapWarId?: number | null;
  configWarId?: number | null;
  configSystemId?: number | null;
}

export interface BatchPhaseRuleSet {
  allowedAssemblyFamilies: Array<{ family: number; weight: number }>;
  allowedAssemblyTypeIds: Array<{ typeId: number; weight: number }>;
  allowedStorageTypeIds: number[];
  requiredItemTypeIds: number[];
}

export interface BatchPhaseSystemDraft {
  systemId: number;
  displayName: string;
  priorityClass?: number;
  registerSystem: boolean;
  systemEnabled?: boolean;
  pointsPerTick: number;
  takeMargin: number;
  holdMargin: number;
  neutralMinTotalPresence: number;
  contestedWhenTied: boolean;
  storageRequirementMode: StorageRequirementMode;
  minimumTotalItemCount: number;
  ruleSet: BatchPhaseRuleSet;
  displayCopy?: SystemDisplayCopy;
  publicRuleText?: string;
}

export interface BatchPhaseConfigDraft {
  kind: "batch-phase-config";
  warId: string;
  phaseNumber: number;
  version: number;
  effectiveFromMs: number;
  effectiveUntilMs: number | null;
  adminCapId: string;
  adminCapWarId: number | null;
  systems: BatchPhaseSystemDraft[];
  defaultTickMinutes: number;
}

export interface EndWarDraft {
  kind: "end-war";
  warId: string | number;
  registryId: string;
  adminCapId: string;
  adminCapWarId: number | null;
  endedAtMs: number;
}

export interface UpdateWarEndTimeDraft {
  kind: "update-war-end-time";
  warId: string | number;
  registryId: string;
  adminCapId: string;
  adminCapWarId: number | null;
  newEndedAtMs: number;
}

export interface CancelWarEndDraft {
  kind: "cancel-war-end";
  warId: string | number;
  registryId: string;
  adminCapId: string;
  adminCapWarId: number | null;
}

export interface SetWinMarginDraft {
  kind: "set-win-margin";
  warId: string | number;
  registryId: string;
  adminCapId: string;
  adminCapWarId: number | null;
  winMargin: number;
}

export interface ResolveWarDraft {
  kind: "resolve-war";
  warId: string | number;
  registryId: string;
  adminCapId: string;
  adminCapWarId: number | null;
  tribeScores: unknown;
}

export interface RegisterTribeDraft {
  kind: "register-tribe";
  warId: string | number;
  registryId: string;
  adminCapId: string;
  adminCapWarId: number | null;
  tribeId: number;
  displayName: string;
}

export type AdminDraft =
  | CreateWarDraft
  | PublishDefaultsDraft
  | UpsertSystemConfigDraft
  | ScheduleSystemChangeDraft
  | ToggleWarDraft
  | CommitSnapshotDraft
  | BatchPhaseConfigDraft
  | EndWarDraft
  | UpdateWarEndTimeDraft
  | CancelWarEndDraft
  | SetWinMarginDraft
  | ResolveWarDraft
  | RegisterTribeDraft;

export interface DraftPreview {
  title: string;
  summary: string[];
  blockingIssues: string[];
  warnings: string[];
  contractCalls: string[];
}

export interface ExecutionRecord {
  digest: string;
  timestampMs: number;
  createdObjectIds: string[];
  createdByType: Record<string, string[]>;
}

export interface RecentPublishedSystemConfig {
  objectId: string;
  txDigest: string;
  warId: number | null;
  systemId: number | null;
  version: number | null;
  effectiveFromMs: number | null;
}
