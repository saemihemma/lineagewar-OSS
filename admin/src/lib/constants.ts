import type {
  AssemblyFamily,
  ControlState,
  ScheduleTargetKind,
  SourceOfTruthMode,
  StorageRequirementMode,
} from "./types";

export const LINEAGE_WAR_PACKAGE_ID = import.meta.env.VITE_LINEAGE_WAR_PACKAGE_ID ?? "0x0";
export const WAR_REGISTRY_ID = import.meta.env.VITE_WAR_REGISTRY_ID ?? "0x0";
export const CURRENT_ADMIN_CAP_ID = import.meta.env.VITE_CURRENT_ADMIN_CAP_ID ?? "";
export const CURRENT_WAR_ID = import.meta.env.VITE_CURRENT_WAR_ID ?? "";
export const SUI_RPC_URL = import.meta.env.VITE_SUI_RPC ?? "https://fullnode.testnet.sui.io";
export const WORLD_API_BASE_URL = import.meta.env.VITE_WORLD_API_BASE ?? "https://world-api-stillness.live.tech.evefrontier.com";

export const CURRENT_ACTIVE_SYSTEM_IDS: number[] = String(import.meta.env.VITE_CURRENT_ACTIVE_SYSTEM_IDS ?? "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

export const ASSEMBLY_TYPE_OPTIONS: Array<{ value: number | null; label: string; family: AssemblyFamily }> = [
  { value: null, label: "Any / custom", family: 3 },
  { value: 88082, label: "Smart Storage Unit (88082)", family: 0 },
  { value: 88086, label: "Smart Gate (88086)", family: 1 },
  { value: 5555, label: "Smart Turret (5555)", family: 2 },
  { value: 87119, label: "Generic Assembly (87119)", family: 3 },
  { value: 88092, label: "Network Node (88092)", family: 3 },
  { value: 88068, label: "Assembly 88068", family: 3 },
  { value: 90184, label: "Assembly 90184", family: 3 },
];
export const ADMIN_UNLOCK_PASSWORD = import.meta.env.VITE_ADMIN_UNLOCK_PASSWORD ?? "";
export const ADMIN_ALLOWLIST = String(import.meta.env.VITE_ADMIN_ALLOWLIST ?? "")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

export const SOURCE_OF_TRUTH_OPTIONS: Array<{ value: SourceOfTruthMode; label: string }> = [
  { value: 0, label: "On-chain only" },
  { value: 1, label: "Prefer on-chain, fallback world API" },
  { value: 2, label: "Verifier required" },
  { value: 3, label: "Trusted publisher fallback" },
];

export const STORAGE_REQUIREMENT_OPTIONS: Array<{ value: StorageRequirementMode; label: string }> = [
  { value: 0, label: "None" },
  { value: 1, label: "Storage must be non-empty" },
  { value: 2, label: "Specific item types required" },
  { value: 3, label: "Minimum total quantity required" },
];

export const ASSEMBLY_FAMILY_OPTIONS: Array<{ value: AssemblyFamily; label: string }> = [
  { value: 0, label: "Storage unit" },
  { value: 1, label: "Gate" },
  { value: 2, label: "Turret" },
  { value: 3, label: "Other" },
];

export const CONTROL_STATE_OPTIONS: Array<{ value: ControlState; label: string }> = [
  { value: 0, label: "Neutral" },
  { value: 1, label: "Contested" },
  { value: 2, label: "Controlled" },
];

export const SCHEDULE_TARGET_OPTIONS: Array<{ value: ScheduleTargetKind; label: string }> = [
  { value: 0, label: "War config" },
  { value: 1, label: "Phase config" },
  { value: 2, label: "System config" },
];

export const ADMIN_CAP_TYPE_SUFFIX = "::registry::WarAdminCap";
export const SYSTEM_CONFIG_TYPE_SUFFIX = "::config::SystemConfigVersion";
