import "dotenv/config";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { VerifierConfig } from "./types.js";

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number`);
  }
  return parsed;
}

function envString(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

function envList(name: string): string[] {
  const raw = process.env[name];
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function envNumberList(name: string): number[] {
  return envList(name).map((entry) => {
    const parsed = Number(entry);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${name} must contain only numbers`);
    }
    return parsed;
  });
}

function parseBooleanLike(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  throw new Error(`Expected boolean-like value, received '${value}'`);
}

function envBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  return parseBooleanLike(raw);
}

function argValue(argv: string[], name: string): string | null {
  const prefix = `${name}=`;
  const match = argv.find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

export function loadVerifierConfig(argv: string[]): VerifierConfig {
  const outputJson = argv.includes("--json");
  const now = Date.now();
  const alignedNow = Math.floor(now / 3_600_000) * 3_600_000;
  const sourceArg = argValue(argv, "--source");
  const source = (sourceArg || process.env.LINEAGE_SOURCE || "mock") as VerifierConfig["source"];
  const scenario = argValue(argv, "--scenario") || envString("LINEAGE_SCENARIO", "two-tribe-two-system");
  const outputPath = argValue(argv, "--output") || process.env.LINEAGE_OUTPUT_PATH || null;
  const phaseStatusWithheldArg = argValue(argv, "--phase-status-withheld");
  const chainRpcUrl =
    argValue(argv, "--rpc-url") ||
    process.env.LINEAGE_SUI_RPC ||
    getJsonRpcFullnodeUrl("testnet");

  if (source !== "mock" && source !== "seeded" && source !== "chain" && source !== "registry") {
    throw new Error(`Unsupported verifier source '${source}'`);
  }

  return {
    warId: envNumber("LINEAGE_WAR_ID", 1),
    tickStartMs: envNumber("LINEAGE_TICK_START_MS", alignedNow),
    tickCount: envNumber("LINEAGE_TICK_COUNT", 2),
    phaseStatusWithheld:
      phaseStatusWithheldArg !== null
        ? parseBooleanLike(phaseStatusWithheldArg)
        : envBoolean("LINEAGE_PHASE_STATUS_WITHHELD", true),
    phaseEndMs: (() => {
      const raw = argValue(argv, "--phase-end-ms") || process.env.LINEAGE_PHASE_END_MS || null;
      if (!raw) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    })(),
    phaseLabel:
      argValue(argv, "--phase-label") || process.env.LINEAGE_PHASE_LABEL || null,
    warEndMs: (() => {
      const raw = argValue(argv, "--war-end-ms") || process.env.LINEAGE_WAR_END_MS || null;
      if (!raw) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    })(),
    outputJson,
    source,
    scenario,
    outputPath,
    systemDisplayConfigPath:
      argValue(argv, "--system-display-config-path") ||
      process.env.LINEAGE_SYSTEM_DISPLAY_CONFIG_PATH ||
      null,
    chain: {
      rpcUrl: chainRpcUrl,
      warRegistryId: argValue(argv, "--war-registry-id") || process.env.LINEAGE_WAR_REGISTRY_ID || null,
      warConfigIds: envList("LINEAGE_WAR_CONFIG_IDS"),
      phaseConfigIds: envList("LINEAGE_PHASE_CONFIG_IDS"),
      systemConfigIds: envList("LINEAGE_SYSTEM_CONFIG_IDS"),
      activeSystemIds: envNumberList("LINEAGE_ACTIVE_SYSTEM_IDS"),
      warSystemIds: envNumberList("LINEAGE_WAR_SYSTEM_IDS"),
      participatingTribeIds: envNumberList("LINEAGE_PARTICIPATING_TRIBE_IDS"),
      packageId: argValue(argv, "--package-id") || process.env.LINEAGE_PACKAGE_ID || null,
      adminCapId: argValue(argv, "--admin-cap-id") || process.env.LINEAGE_ADMIN_CAP_ID || null,
      assemblyRegistryPath:
        argValue(argv, "--assembly-registry-path") ||
        process.env.LINEAGE_ASSEMBLY_REGISTRY_PATH ||
        null,
      assemblyObjectIds: envList("LINEAGE_ASSEMBLY_OBJECT_IDS"),
      ownerTribeRegistryPath:
        argValue(argv, "--owner-tribe-registry-path") ||
        process.env.LINEAGE_OWNER_TRIBE_REGISTRY_PATH ||
        null,
      locationMappingPath:
        argValue(argv, "--location-mapping-path") ||
        process.env.LINEAGE_LOCATION_MAPPING_PATH ||
        null,
      assemblySystemMappingPath:
        argValue(argv, "--assembly-system-mapping-path") ||
        process.env.LINEAGE_ASSEMBLY_SYSTEM_MAPPING_PATH ||
        null,
      graphqlUrl:
        argValue(argv, "--graphql-url") ||
        process.env.LINEAGE_SUI_GRAPHQL_URL ||
        null,
      locationQueryMode: (() => {
        const raw = argValue(argv, "--location-query-mode") || process.env.LINEAGE_LOCATION_QUERY_MODE || "off";
        if (raw === "auto" || raw === "graphql" || raw === "rpc" || raw === "off") return raw;
        throw new Error(`Unsupported location query mode '${raw}'`);
      })(),
      locationEventType:
        argValue(argv, "--location-event-type") ||
        process.env.LINEAGE_LOCATION_EVENT_TYPE ||
        (process.env.LINEAGE_WORLD_PACKAGE_ID
          ? `${process.env.LINEAGE_WORLD_PACKAGE_ID}::location::LocationRevealedEvent`
          : null),
      locationEventsPageSize: envNumber("LINEAGE_LOCATION_EVENTS_PAGE_SIZE", 50),
      locationEventsMaxPages: envNumber("LINEAGE_LOCATION_EVENTS_MAX_PAGES", 20),
      worldPackageId:
        argValue(argv, "--world-package-id") ||
        process.env.LINEAGE_WORLD_PACKAGE_ID ||
        null,
      worldTenant:
        argValue(argv, "--world-tenant") ||
        process.env.LINEAGE_WORLD_TENANT ||
        null,
      assemblyDiscoveryMode: (() => {
        const raw = argValue(argv, "--assembly-discovery-mode") || process.env.LINEAGE_ASSEMBLY_DISCOVERY_MODE || "off";
        if (raw === "off" || raw === "graphql") return raw;
        throw new Error(`Unsupported assembly discovery mode '${raw}'`);
      })(),
    },
  };
}
