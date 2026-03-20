import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { discoverAssemblies } from "./assembly-discovery.js";
import { OnChainConfigVerifierDataSource } from "./chain-source.js";
import { resolveAssembliesViaGraphQL, type GraphqlAssemblyState } from "./graphql-assembly-source.js";
import { queryLocationEvents } from "./location-event-query.js";
import { loadSeededWorldResources } from "./seeded-world.js";
import { TribeResolver } from "./tribe-resolver.js";
import {
  AssemblySystemMappingDocument,
  AssemblySystemMappingEntry,
  AuditInputSummary,
  AssemblyFamily,
  CandidateAssembly,
  InventoryEntry,
  LocationMappingDocument,
  LocationMappingEntry,
  LiveAssemblyRegistryDocument,
  LiveAssemblyRegistryEntry,
  SeededWorldResources,
  VerifierConfig,
} from "./types.js";

type MoveFields = Record<string, unknown>;

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function normalizeRegistryDocument(raw: unknown): LiveAssemblyRegistryEntry[] {
  if (Array.isArray(raw)) {
    return raw as LiveAssemblyRegistryEntry[];
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as LiveAssemblyRegistryDocument).assemblies)) {
    return (raw as LiveAssemblyRegistryDocument).assemblies;
  }
  throw new Error("Assembly registry file must be an array or an object with an assemblies array");
}

function loadRegistryEntries(
  config: VerifierConfig,
  resources: SeededWorldResources,
): LiveAssemblyRegistryEntry[] {
  const configuredPath = config.chain.assemblyRegistryPath
    ? path.resolve(process.cwd(), config.chain.assemblyRegistryPath)
    : null;

  if (configuredPath && existsSync(configuredPath)) {
    return normalizeRegistryDocument(readJsonFile<unknown>(configuredPath));
  }

  if (config.chain.assemblyObjectIds.length > 0) {
    return config.chain.assemblyObjectIds.map((objectId) => ({ objectId }));
  }

  return Object.entries(resources.objectIds ?? {})
    .filter(([seedKey, objectId]) => Boolean(objectId) && Boolean(resources.assemblySeeds[seedKey]))
    .map(([seedKey, objectId]) => ({
      objectId: objectId!,
      seedKey,
    }));
}

function normalizeLocationMappings(raw: unknown): LocationMappingEntry[] {
  if (Array.isArray(raw)) {
    return raw as LocationMappingEntry[];
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as LocationMappingDocument).locations)) {
    return (raw as LocationMappingDocument).locations;
  }
  throw new Error("Location mapping file must be an array or an object with a locations array");
}

function loadLocationMappings(config: VerifierConfig): LocationMappingEntry[] {
  const configuredPath = config.chain.locationMappingPath
    ? path.resolve(process.cwd(), config.chain.locationMappingPath)
    : null;

  if (!configuredPath || !existsSync(configuredPath)) {
    return [];
  }

  return normalizeLocationMappings(readJsonFile<unknown>(configuredPath));
}

function normalizeAssemblySystemMappings(raw: unknown): AssemblySystemMappingEntry[] {
  if (Array.isArray(raw)) {
    return raw as AssemblySystemMappingEntry[];
  }
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as AssemblySystemMappingDocument).assemblies)
  ) {
    return (raw as AssemblySystemMappingDocument).assemblies;
  }
  throw new Error("Assembly system mapping file must be an array or an object with an assemblies array");
}

function loadAssemblySystemMappings(config: VerifierConfig): AssemblySystemMappingEntry[] {
  const configuredPath = config.chain.assemblySystemMappingPath
    ? path.resolve(process.cwd(), config.chain.assemblySystemMappingPath)
    : null;

  if (!configuredPath || !existsSync(configuredPath)) {
    return [];
  }

  return normalizeAssemblySystemMappings(readJsonFile<unknown>(configuredPath));
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeHex(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return normalized.startsWith("0x") ? normalized : `0x${normalized}`;
}

function bytesToHex(value: unknown): string | null {
  if (typeof value === "string") {
    return normalizeHex(value);
  }
  if (Array.isArray(value) && value.every((entry) => typeof entry === "number")) {
    return normalizeHex(value.map((entry) => entry.toString(16).padStart(2, "0")).join(""));
  }
  return null;
}

function normalizeStatus(value: unknown): CandidateAssembly["status"] | null {
  if (typeof value === "boolean") {
    return value ? "ONLINE" : "OFFLINE";
  }
  if (typeof value === "number") {
    if (value === 0) return "OFFLINE";
    if (value === 1) return "ONLINE";
  }
  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();
    if (normalized.includes("ONLINE")) return "ONLINE";
    if (normalized.includes("OFFLINE")) return "OFFLINE";
    if (normalized.includes("NULL")) return "NULL";
  }
  return null;
}

function walkObject(root: unknown, visit: (key: string, value: unknown) => unknown): unknown {
  const queue: unknown[] = [root];
  const seen = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || seen.has(current)) {
      continue;
    }
    seen.add(current);

    if (Array.isArray(current)) {
      for (const entry of current) {
        queue.push(entry);
      }
      continue;
    }

    for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
      const match = visit(key, value);
      if (match !== undefined) {
        return match;
      }
      queue.push(value);
    }
  }

  return null;
}

function findFieldValue(fields: MoveFields, candidateKeys: string[]): unknown | null {
  const normalizedKeys = candidateKeys.map((entry) => entry.toLowerCase());
  return walkObject(fields, (key, value) => {
    const normalizedKey = key.toLowerCase();
    return normalizedKeys.includes(normalizedKey) ? value : undefined;
  }) as unknown | null;
}

function parseOwnerId(owner: unknown): string | null {
  if (typeof owner === "string") {
    return owner;
  }
  if (!owner || typeof owner !== "object") {
    return null;
  }

  const entries = Object.entries(owner as Record<string, unknown>);
  for (const [key, value] of entries) {
    if (
      (key === "AddressOwner" || key === "ObjectOwner") &&
      typeof value === "string" &&
      value.startsWith("0x")
    ) {
      return value;
    }
  }

  return null;
}

function parseOwnerCharacterId(fields: MoveFields | null, owner: unknown): string | null {
  const ownerFromFields =
    (fields &&
      (findFieldValue(fields, [
        "character_id",
        "characterId",
        "owner_character_id",
        "ownerCharacterId",
        "smart_character_id",
        "smartCharacterId",
        "character_address",
        "characterAddress",
        "owner_object_id",
        "ownerObjectId",
      ]) as string | null)) ||
    null;

  return typeof ownerFromFields === "string" && ownerFromFields.length > 0
    ? ownerFromFields
    : parseOwnerId(owner);
}

function getMoveFields(response: unknown): MoveFields | null {
  const content = (response as { data?: { content?: unknown } }).data?.content;
  if (content && typeof content === "object" && "fields" in content) {
    const fields = (content as { fields?: unknown }).fields;
    if (fields && typeof fields === "object" && !Array.isArray(fields)) {
      return fields as MoveFields;
    }
  }
  return null;
}

function getLiveStatus(fields: MoveFields | null): CandidateAssembly["status"] | null {
  if (!fields) {
    return null;
  }

  return (
    normalizeStatus(findFieldValue(fields, ["is_online", "online", "is_enabled", "enabled"])) ||
    normalizeStatus(findFieldValue(fields, ["status", "state"]))
  );
}

function getLiveTypeId(fields: MoveFields | null): number | null {
  if (!fields) {
    return null;
  }

  return (
    toNumberOrNull(findFieldValue(fields, ["assembly_type_id", "assemblyTypeId"])) ||
    toNumberOrNull(findFieldValue(fields, ["type_id", "typeId"]))
  );
}

function getLiveStorageTypeId(fields: MoveFields | null): number | null {
  if (!fields) {
    return null;
  }

  return toNumberOrNull(findFieldValue(fields, ["storage_type_id", "storageTypeId"]));
}

function getLiveSystemId(fields: MoveFields | null): number | null {
  if (!fields) {
    return null;
  }

  return toNumberOrNull(findFieldValue(fields, ["system_id", "systemId"]));
}

function getLiveLocationHashHex(fields: MoveFields | null): string | null {
  if (!fields) {
    return null;
  }

  return bytesToHex(findFieldValue(fields, ["location_hash", "locationHash"]));
}

type BootstrapAssemblyFields = {
  ownerCharacterId: string | null;
  locationHashHex: string | null;
  systemId: number | null;
  assemblyTypeId: number | null;
  assemblyFamily: AssemblyFamily | null;
  storageTypeId: number | null;
  status: CandidateAssembly["status"] | undefined;
  inventory: InventoryEntry[] | undefined;
};

function getBootstrapAssemblyFields(entry: LiveAssemblyRegistryEntry): BootstrapAssemblyFields {
  return {
    ownerCharacterId: entry.bootstrapOwnerCharacterId ?? entry.fallbackOwnerCharacterId ?? null,
    locationHashHex: normalizeHex(entry.bootstrapLocationHashHex ?? entry.fallbackLocationHashHex ?? null),
    systemId: entry.bootstrapSystemId ?? entry.fallbackSystemId ?? null,
    assemblyTypeId: entry.bootstrapAssemblyTypeId ?? entry.fallbackAssemblyTypeId ?? null,
    assemblyFamily: entry.bootstrapAssemblyFamily ?? entry.fallbackAssemblyFamily ?? null,
    storageTypeId: entry.bootstrapStorageTypeId ?? entry.fallbackStorageTypeId ?? null,
    status: entry.bootstrapStatus ?? entry.fallbackStatus,
    inventory: entry.bootstrapInventory ?? entry.fallbackInventory,
  };
}

function parseGraphqlStatus(json: Record<string, unknown>): CandidateAssembly["status"] | null {
  const status = json.status as Record<string, unknown> | undefined;
  if (!status) return null;
  const inner = status.status as Record<string, unknown> | undefined;
  if (!inner) return null;
  const variant = inner["@variant"];
  if (variant === "ONLINE") return "ONLINE";
  if (variant === "OFFLINE") return "OFFLINE";
  return null;
}

function classifyFamilyFromTypeRepr(typeRepr: string | null | undefined): AssemblyFamily | null {
  if (!typeRepr) return null;
  if (typeRepr.includes("::storage_unit::StorageUnit")) return "smart_storage_unit";
  if (typeRepr.includes("::gate::Gate")) return "smart_gate";
  if (typeRepr.includes("::turret::Turret")) return "smart_turret";
  return "other";
}

function resolveSystemLocation(
  assemblyId: string,
  fields: MoveFields | null,
  bootstrap: BootstrapAssemblyFields,
  systemIdByLocationHashHex: Map<string, number>,
  systemIdByAssemblyId: Map<string, number>,
): { systemId: number | null; systemSource: string; locationSource: string | null } {
  // LocationRegistry cutover should only need to replace this resolver and then
  // remove the bootstrap fields once live published `solarsystem` is available.
  const liveSystemId = getLiveSystemId(fields);
  const liveLocationHashHex = getLiveLocationHashHex(fields) ?? bootstrap.locationHashHex;

  if (liveSystemId !== null) {
    return {
      systemId: liveSystemId,
      systemSource: "live_system_id",
      locationSource: liveLocationHashHex ? "location_hash_bootstrap" : null,
    };
  }

  const mappedByAssemblyId = systemIdByAssemblyId.get(assemblyId) ?? null;
  if (mappedByAssemblyId !== null) {
    return {
      systemId: mappedByAssemblyId,
      systemSource: "assembly_system_mapping_manifest",
      locationSource: "location_registry_event_manifest",
    };
  }

  if (liveLocationHashHex) {
    const mappedSystemId = systemIdByLocationHashHex.get(liveLocationHashHex) ?? null;
    if (mappedSystemId !== null) {
      return {
        systemId: mappedSystemId,
        systemSource: "location_hash_bootstrap_mapping",
        locationSource: "location_hash_bootstrap",
      };
    }
  }

  return {
    systemId: bootstrap.systemId,
    systemSource: "bootstrap_system_id",
    locationSource: liveLocationHashHex ? "location_hash_bootstrap" : null,
  };
}

export class RegistryBackedVerifierDataSource extends OnChainConfigVerifierDataSource {
  private readonly resources: SeededWorldResources = loadSeededWorldResources();
  private registryEntries: LiveAssemblyRegistryEntry[];
  private readonly systemIdByLocationHashHex: Map<string, number>;
  private readonly systemIdByAssemblyId: Map<string, number>;
  private readonly seedKeyByObjectId: Map<string, string>;
  private readonly tribeResolver: TribeResolver;
  private readonly discoveredAssemblyIds: Set<string> = new Set();

  constructor(config: VerifierConfig) {
    super(config);
    this.registryEntries = loadRegistryEntries(config, this.resources);
    this.systemIdByLocationHashHex = new Map(
      loadLocationMappings(config)
        .map((entry) => [normalizeHex(entry.locationHashHex), entry.systemId] as const)
        .filter((entry): entry is [string, number] => entry[0] !== null),
    );
    this.systemIdByAssemblyId = new Map(
      loadAssemblySystemMappings(config)
        .map((entry) => [String(entry.assemblyId ?? "").toLowerCase(), entry.systemId] as const)
        .filter((entry): entry is [string, number] => Boolean(entry[0]) && Number.isFinite(entry[1])),
    );
    this.seedKeyByObjectId = new Map(
      Object.entries(this.resources.objectIds ?? {})
        .filter(([seedKey, objectId]) => Boolean(objectId) && Boolean(this.resources.assemblySeeds[seedKey]))
        .map(([seedKey, objectId]) => [objectId!, seedKey]),
    );
    this.tribeResolver = new TribeResolver(config);
  }

  async getCandidateAssemblies(systemId: number, timestampMs: number): Promise<CandidateAssembly[]> {
    if (this.registryEntries.length === 0) {
      return super.getCandidateAssemblies(systemId, timestampMs);
    }

    const graphqlUrl = this.config.chain.graphqlUrl;
    if (graphqlUrl) {
      return this.getCandidateAssembliesViaGraphQL(systemId, graphqlUrl);
    }

    return this.getCandidateAssembliesViaRpc(systemId);
  }

  private entriesForSystem(systemId: number): LiveAssemblyRegistryEntry[] {
    return this.registryEntries.filter((entry) => {
      const mappedSystem = this.systemIdByAssemblyId.get(entry.objectId.toLowerCase());
      return mappedSystem === systemId;
    });
  }

  private async getCandidateAssembliesViaRpc(systemId: number): Promise<CandidateAssembly[]> {
    const entries = this.entriesForSystem(systemId);
    if (entries.length === 0) return [];

    const responses = await this.client.multiGetObjects({
      ids: entries.map((entry) => entry.objectId),
      options: {
        showContent: true,
        showOwner: true,
        showType: true,
      },
    });

    return responses
      .map((response, index) => this.materializeCandidate(entries[index], response))
      .filter((entry): entry is CandidateAssembly => entry !== null)
      .filter((entry) => entry.systemId === systemId);
  }

  private async getCandidateAssembliesViaGraphQL(
    systemId: number,
    graphqlUrl: string,
  ): Promise<CandidateAssembly[]> {
    const entries = this.entriesForSystem(systemId);
    if (entries.length === 0) return [];

    const ids = entries.map((entry) => entry.objectId);
    const resolved = await resolveAssembliesViaGraphQL(graphqlUrl, ids);

    const candidates: CandidateAssembly[] = [];
    for (const entry of entries) {
      const candidate = this.materializeCandidateFromGraphQL(entry, resolved.get(entry.objectId.toLowerCase()));
      if (candidate && candidate.systemId === systemId) {
        candidates.push(candidate);
      }
    }
    return candidates;
  }

  private materializeCandidateFromGraphQL(
    entry: LiveAssemblyRegistryEntry,
    gqlState: GraphqlAssemblyState | undefined,
  ): CandidateAssembly | null {
    const seedKey = entry.seedKey ?? this.seedKeyByObjectId.get(entry.objectId);
    const seededAssembly = seedKey ? this.resources.assemblySeeds[seedKey] : null;
    const bootstrap = getBootstrapAssemblyFields(entry);
    const json = gqlState?.json;

    const liveStatus = json ? parseGraphqlStatus(json) : null;
    const liveAssemblyTypeId = json ? toNumberOrNull(json.type_id) : null;
    const liveStorageTypeId = json ? toNumberOrNull(json.storage_type_id) : null;

    const ownerCharacterId = gqlState?.wallet ?? bootstrap.ownerCharacterId;
    const tribeId = gqlState?.tribeId ?? this.tribeResolver.resolveOwnerToTribeId(ownerCharacterId);

    const locationResolution = resolveSystemLocation(
      entry.objectId.toLowerCase(),
      json ? (json as MoveFields) : null,
      bootstrap,
      this.systemIdByLocationHashHex,
      this.systemIdByAssemblyId,
    );
    const resolvedSystemId = locationResolution.systemId;
    const resolvedAssemblyTypeId =
      liveAssemblyTypeId ?? seededAssembly?.assemblyTypeId ?? bootstrap.assemblyTypeId ?? null;

    if (
      resolvedSystemId == null ||
      ownerCharacterId == null ||
      tribeId == null ||
      resolvedAssemblyTypeId == null
    ) {
      return null;
    }

    const assemblyFamily = classifyFamilyFromTypeRepr(gqlState?.typeRepr)
      ?? seededAssembly?.assemblyFamily
      ?? bootstrap.assemblyFamily
      ?? ("other" satisfies AssemblyFamily);

    return {
      assemblyId: entry.objectId,
      systemId: resolvedSystemId,
      ownerCharacterId,
      tribeId,
      assemblyFamily,
      assemblyTypeId: resolvedAssemblyTypeId,
      storageTypeId:
        liveStorageTypeId ?? seededAssembly?.storageTypeId ?? bootstrap.storageTypeId ?? null,
      status: liveStatus ?? bootstrap.status ?? (json ? "ONLINE" : "NULL"),
      inventory: bootstrap.inventory ?? ([] satisfies InventoryEntry[]),
      provenance: {
        candidateSource: json ? "graphql_live_object" : "registry_entry_bootstrap",
        systemSource: locationResolution.systemSource,
        ownerCharacterSource: gqlState?.wallet ? "graphql_ownercap_chain" : bootstrap.ownerCharacterId ? "bootstrap_owner_character" : "unresolved",
        tribeSource: gqlState?.tribeId != null ? "graphql_character_tribe" : "owner_tribe_registry_manifest",
        assemblyMetadataSource:
          liveAssemblyTypeId !== null || liveStorageTypeId !== null
            ? "graphql_live_fields"
            : seededAssembly
              ? "seeded_world"
              : "registry_bootstrap",
        statusSource: liveStatus ? "graphql_live_fields" : bootstrap.status ? "registry_bootstrap" : json ? "assumed_live_online" : "null_object",
        inventorySource: bootstrap.inventory ? "registry_bootstrap" : "none",
        locationSource: locationResolution.locationSource,
      },
    };
  }

  getTribeNameMap(): Record<string, string> {
    return this.tribeResolver.getTribeNameMap();
  }

  async enrichTribeNamesFromWorldApi(worldApiBase: string): Promise<void> {
    return this.tribeResolver.enrichFromWorldApi(worldApiBase);
  }

  /**
   * Promote assembly IDs discovered via location events into registryEntries,
   * so they get fetched during getCandidateAssemblies. Only adds IDs not already
   * present in registryEntries from static files.
   */
  promoteDiscoveredAssemblyIds(): number {
    if (this.discoveredAssemblyIds.size === 0) return 0;
    const existing = new Set(this.registryEntries.map((e) => e.objectId.toLowerCase()));
    let added = 0;
    for (const assemblyId of this.discoveredAssemblyIds) {
      if (!existing.has(assemblyId)) {
        this.registryEntries.push({ objectId: assemblyId });
        added += 1;
      }
    }
    if (added > 0) {
      console.log(`[registry] Promoted ${added} location-discovered assemblies into registry entries`);
    }
    return added;
  }

  async discoverAssembliesFromChain(): Promise<number> {
    const { assemblyDiscoveryMode, worldPackageId, worldTenant, graphqlUrl } = this.config.chain;
    if (assemblyDiscoveryMode === "off" || !worldPackageId || !worldTenant) return 0;

    const effectiveGraphqlUrl = graphqlUrl ?? this.config.chain.rpcUrl;
    const entries = await discoverAssemblies({
      graphqlUrl: effectiveGraphqlUrl,
      worldPackageId,
      tenant: worldTenant,
    });

    if (entries.length > 0) {
      this.registryEntries = entries;
    }
    return entries.length;
  }

  async refreshLocationMappingsFromEvents(): Promise<number> {
    const { locationQueryMode, locationEventType, graphqlUrl, locationEventsPageSize, locationEventsMaxPages, warSystemIds } =
      this.config.chain;
    if (locationQueryMode === "off" || !locationEventType) return 0;
    const rpcUrl = this.config.chain.rpcUrl;
    const effectiveGraphqlUrl = graphqlUrl ?? rpcUrl;
    const warSystemSet = new Set(warSystemIds);
    const { entries } = await queryLocationEvents(
      locationQueryMode,
      effectiveGraphqlUrl,
      rpcUrl,
      locationEventType,
      locationEventsPageSize,
      locationEventsMaxPages,
      warSystemSet,
    );
    let added = 0;
    for (const entry of entries) {
      if (warSystemSet.size > 0 && !warSystemSet.has(entry.systemId)) continue;
      const key = entry.assemblyId.toLowerCase();
      if (!this.systemIdByAssemblyId.has(key)) {
        this.systemIdByAssemblyId.set(key, entry.systemId);
        added += 1;
      }
      this.discoveredAssemblyIds.add(key);
    }
    return added;
  }

  getAuditInputSummary(): AuditInputSummary {
    const graphqlEnabled = Boolean(this.config.chain.graphqlUrl);
    return {
      candidateCollection: {
        mode: this.config.chain.assemblyDiscoveryMode === "graphql"
          ? "graphql_chain_discovery"
          : graphqlEnabled
            ? "graphql_per_tick_primary"
            : "registry_live_objects",
        path: this.config.chain.assemblyRegistryPath,
        objectCount: this.registryEntries.length,
      },
      activeSystems: {
        mode: this.config.chain.activeSystemIds.length > 0 ? "declared_active_system_ids" : "scenario_phase_bootstrap",
        detail:
          this.config.chain.activeSystemIds.length > 0
            ? this.config.chain.activeSystemIds.join(",")
            : this.seededFallback.scenario.phase.displayName,
      },
      ownerResolution: {
        mode: graphqlEnabled ? "graphql_ownercap_chain" : "owner_tribe_registry_manifest",
        path: graphqlEnabled ? undefined : this.config.chain.ownerTribeRegistryPath,
        objectCount: graphqlEnabled ? undefined : this.tribeResolver.getParticipatingTribeIds().length,
      },
      locationResolution: {
        mode: this.config.chain.assemblySystemMappingPath
          ? "assembly_system_mapping_manifest"
          : this.config.chain.locationMappingPath
            ? "location_hash_bootstrap_manifest"
            : "live_system_field_or_bootstrap_manifest",
        path: this.config.chain.assemblySystemMappingPath ?? this.config.chain.locationMappingPath,
        objectCount:
          this.systemIdByAssemblyId.size > 0
            ? this.systemIdByAssemblyId.size
            : this.systemIdByLocationHashHex.size,
      },
    };
  }

  private materializeCandidate(entry: LiveAssemblyRegistryEntry, response: unknown): CandidateAssembly | null {
    const seedKey = entry.seedKey ?? this.seedKeyByObjectId.get(entry.objectId);
    const seededAssembly = seedKey ? this.resources.assemblySeeds[seedKey] : null;
    const fields = getMoveFields(response);
    const bootstrap = getBootstrapAssemblyFields(entry);
    const ownerCharacterId = parseOwnerCharacterId(
      fields,
      (response as { data?: { owner?: unknown } }).data?.owner,
    );
    const resolvedOwnerCharacterId = ownerCharacterId ?? bootstrap.ownerCharacterId;
    const resolvedTribeId = this.tribeResolver.resolveOwnerToTribeId(resolvedOwnerCharacterId);
    const liveStatus = getLiveStatus(fields);
    const liveAssemblyTypeId = getLiveTypeId(fields);
    const liveStorageTypeId = getLiveStorageTypeId(fields);
    const locationResolution = resolveSystemLocation(
      entry.objectId.toLowerCase(),
      fields,
      bootstrap,
      this.systemIdByLocationHashHex,
      this.systemIdByAssemblyId,
    );
    const resolvedSystemId = locationResolution.systemId;
    const resolvedAssemblyTypeId =
      liveAssemblyTypeId ?? seededAssembly?.assemblyTypeId ?? bootstrap.assemblyTypeId ?? null;

    if (
      resolvedSystemId == null ||
      resolvedOwnerCharacterId == null ||
      resolvedTribeId == null ||
      resolvedAssemblyTypeId == null
    ) {
      return null;
    }

    return {
      assemblyId: entry.objectId,
      systemId: resolvedSystemId,
      ownerCharacterId: resolvedOwnerCharacterId,
      tribeId: resolvedTribeId,
      assemblyFamily:
        seededAssembly?.assemblyFamily ?? bootstrap.assemblyFamily ?? ("other" satisfies AssemblyFamily),
      assemblyTypeId: resolvedAssemblyTypeId,
      storageTypeId:
        liveStorageTypeId ?? seededAssembly?.storageTypeId ?? bootstrap.storageTypeId ?? null,
      status: liveStatus ?? bootstrap.status ?? (fields ? "ONLINE" : "NULL"),
      inventory: bootstrap.inventory ?? ([] satisfies InventoryEntry[]),
      provenance: {
        candidateSource: fields ? "registry_live_object" : "registry_entry_bootstrap",
        systemSource: locationResolution.systemSource,
        ownerCharacterSource: ownerCharacterId ? "live_object_owner" : bootstrap.ownerCharacterId ? "bootstrap_owner_character" : "unresolved",
        tribeSource: "owner_tribe_registry_manifest",
        assemblyMetadataSource:
          liveAssemblyTypeId !== null || liveStorageTypeId !== null
            ? "live_object_fields"
            : seededAssembly
              ? "seeded_world"
              : "registry_bootstrap",
        statusSource: liveStatus ? "live_object_fields" : bootstrap.status ? "registry_bootstrap" : fields ? "assumed_live_online" : "null_object",
        inventorySource: bootstrap.inventory ? "registry_bootstrap" : "none",
        locationSource: locationResolution.locationSource,
      },
    };
  }
}
