/**
 * On-chain assembly discovery via Sui GraphQL.
 *
 * Queries all deployed smart assemblies across the 3 Move object types
 * (assembly::Assembly, storage_unit::StorageUnit, network_node::NetworkNode),
 * filters by tenant, and returns LiveAssemblyRegistryEntry[].
 */

import type { AssemblyFamily, LiveAssemblyRegistryEntry } from "./types.js";

const ASSEMBLY_MODULES = [
  "assembly::Assembly",
  "storage_unit::StorageUnit",
  "network_node::NetworkNode",
  "turret::Turret",
  "gate::Gate",
] as const;

const OBJECTS_QUERY = `
query DiscoverAssemblies($type: String!, $first: Int!, $after: String) {
  objects(filter: { type: $type }, first: $first, after: $after) {
    nodes {
      address
      asMoveObject {
        contents {
          json
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`;

type GraphqlPageInfo = {
  hasNextPage?: boolean;
  endCursor?: string | null;
};

type GraphqlNode = {
  address?: string;
  asMoveObject?: {
    contents?: {
      json?: Record<string, unknown>;
    };
  };
};

type GraphqlResponse = {
  data?: {
    objects?: {
      nodes?: GraphqlNode[];
      pageInfo?: GraphqlPageInfo;
    };
  };
  errors?: Array<{ message?: string }>;
};

export type DiscoveryOptions = {
  graphqlUrl: string;
  worldPackageId: string;
  tenant: string;
  pageSize?: number;
  maxPages?: number;
};

const STORAGE_TYPE_IDS = new Set([77917, 88082, 88083]);
const GATE_TYPE_IDS = new Set([84955]);
const TURRET_TYPE_IDS = new Set([84556, 92279, 92401, 92404]);

function classifyAssemblyFamily(typeId: number): AssemblyFamily {
  if (STORAGE_TYPE_IDS.has(typeId)) return "smart_storage_unit";
  if (GATE_TYPE_IDS.has(typeId)) return "smart_gate";
  if (TURRET_TYPE_IDS.has(typeId)) return "smart_turret";
  return "other";
}

function parseStatus(json: Record<string, unknown>): "ONLINE" | "OFFLINE" | undefined {
  const status = json.status as Record<string, unknown> | undefined;
  if (!status) return undefined;
  const inner = status.status as Record<string, unknown> | undefined;
  if (!inner) return undefined;
  const variant = inner["@variant"];
  if (variant === "ONLINE") return "ONLINE";
  if (variant === "OFFLINE") return "OFFLINE";
  return undefined;
}

function parseLocationHash(json: Record<string, unknown>): string | undefined {
  const location = json.location as Record<string, unknown> | undefined;
  if (!location) return undefined;
  const hash = location.location_hash;
  return typeof hash === "string" && hash.length > 0 ? hash : undefined;
}

function nodeToEntry(node: GraphqlNode): LiveAssemblyRegistryEntry | null {
  const address = node.address;
  const json = node.asMoveObject?.contents?.json;
  if (!address || !json) return null;

  const typeId = Number(json.type_id);
  const status = parseStatus(json);
  const locationHash = parseLocationHash(json);

  const entry: LiveAssemblyRegistryEntry = {
    objectId: address,
    bootstrapAssemblyTypeId: Number.isFinite(typeId) ? typeId : null,
    bootstrapAssemblyFamily: Number.isFinite(typeId) ? classifyAssemblyFamily(typeId) : undefined,
    bootstrapStatus: status,
  };

  if (locationHash) {
    entry.bootstrapLocationHashHex = locationHash;
  }

  const ownerCapId = json.owner_cap_id;
  if (typeof ownerCapId === "string" && ownerCapId.startsWith("0x")) {
    entry.bootstrapOwnerCharacterId = ownerCapId;
  }

  return entry;
}

async function queryObjectsOfType(
  graphqlUrl: string,
  fullType: string,
  tenant: string,
  pageSize: number,
  maxPages: number,
): Promise<LiveAssemblyRegistryEntry[]> {
  const entries: LiveAssemblyRegistryEntry[] = [];
  let after: string | null = null;
  let page = 0;

  while (page < maxPages) {
    const variables: Record<string, unknown> = { type: fullType, first: pageSize };
    if (after) variables.after = after;

    const response = await fetch(graphqlUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: OBJECTS_QUERY, variables }),
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed (${response.status}) for type ${fullType}`);
    }

    const payload = (await response.json()) as GraphqlResponse;
    if (payload.errors?.length) {
      throw new Error(
        `GraphQL errors for ${fullType}: ${payload.errors.map((e) => e.message ?? "unknown").join("; ")}`,
      );
    }

    const nodes = payload.data?.objects?.nodes ?? [];
    for (const node of nodes) {
      const json = node.asMoveObject?.contents?.json;
      if (!json) continue;

      const key = json.key as Record<string, unknown> | undefined;
      if (key?.tenant !== tenant) continue;

      const entry = nodeToEntry(node);
      if (entry) entries.push(entry);
    }

    const pageInfo = payload.data?.objects?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    after = pageInfo.endCursor;
    page += 1;
  }

  return entries;
}

export async function discoverAssemblies(
  options: DiscoveryOptions,
): Promise<LiveAssemblyRegistryEntry[]> {
  const { graphqlUrl, worldPackageId, tenant, pageSize = 50, maxPages = 100 } = options;
  const allEntries: LiveAssemblyRegistryEntry[] = [];

  for (const moduleName of ASSEMBLY_MODULES) {
    const fullType = `${worldPackageId}::${moduleName}`;
    console.log(`[discovery] Querying ${moduleName} (tenant=${tenant})...`);

    const entries = await queryObjectsOfType(graphqlUrl, fullType, tenant, pageSize, maxPages);
    console.log(`[discovery] ${moduleName}: found ${entries.length} assemblies`);
    allEntries.push(...entries);
  }

  console.log(`[discovery] Total: ${allEntries.length} assemblies for tenant "${tenant}"`);
  return allEntries;
}
