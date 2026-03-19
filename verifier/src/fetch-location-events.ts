import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AssemblySystemMappingDocument } from "./types.js";

type GraphqlResponse = {
  data?: {
    events?: {
      nodes?: Array<{
        timestamp?: string;
        transaction?: { digest?: string };
        contents?: { json?: unknown };
      }>;
      pageInfo?: {
        hasNextPage?: boolean;
        endCursor?: string | null;
      };
    };
  };
  errors?: Array<{ message?: string }>;
};

type RpcEventsResponse = {
  result?: {
    data?: Array<{
      id?: { txDigest?: string; eventSeq?: string };
      parsedJson?: unknown;
      timestampMs?: string;
    }>;
    nextCursor?: { txDigest?: string; eventSeq?: string } | null;
    hasNextPage?: boolean;
  };
  error?: { code?: number; message?: string };
};

type SystemNameRecord = {
  systemId: number;
  systemName: string;
  source: "world_api" | "fallback_id";
};

function argValue(argv: string[], name: string): string | null {
  const prefix = `${name}=`;
  const match = argv.find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be numeric`);
  }
  return parsed;
}

function normalizeObjectId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed.startsWith("0x") || trimmed.length < 8) {
    return null;
  }
  return trimmed;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function walk(root: unknown, visit: (key: string, value: unknown) => unknown): unknown {
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

function findField(root: unknown, keys: string[]): unknown | null {
  const normalized = keys.map((entry) => entry.toLowerCase());
  return walk(root, (key, value) => {
    if (normalized.includes(key.toLowerCase())) {
      return value;
    }
    return undefined;
  }) as unknown | null;
}

function extractAssemblyId(json: unknown): string | null {
  const direct = findField(json, [
    "assembly_id",
    "assemblyId",
    "object_id",
    "objectId",
    "entity_id",
    "entityId",
  ]);
  const normalized = normalizeObjectId(direct);
  if (normalized) {
    return normalized;
  }
  return normalizeObjectId(findField(json, ["id"]));
}

function extractSystemId(json: unknown): number | null {
  return toFiniteNumber(findField(json, ["solarsystem", "solarSystem", "system_id", "systemId"]));
}

async function fetchLocationEvents(
  graphqlUrl: string,
  eventType: string,
  first: number,
  maxPages: number,
): Promise<
  Array<{
    assemblyId: string;
    systemId: number;
    timestamp?: string;
    txDigest?: string;
    x?: number;
    y?: number;
    z?: number;
  }>
> {
  const query = `
query FindRevealedLocations($locationEventType: String!, $first: Int = 50, $after: String) {
  events(first: $first, after: $after, filter: { type: $locationEventType }) {
    nodes {
      timestamp
      transaction { digest }
      contents { json }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`;

  const allEntries = new Map<
    string,
    {
      assemblyId: string;
      systemId: number;
      timestamp?: string;
      txDigest?: string;
      x?: number;
      y?: number;
      z?: number;
    }
  >();
  let after: string | null = null;
  let page = 0;

  while (page < maxPages) {
    const response = await fetch(graphqlUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query,
        variables: {
          locationEventType: eventType,
          first,
          after,
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`GraphQL request failed (${response.status})`);
    }
    const payload = (await response.json()) as GraphqlResponse;
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((entry) => entry.message ?? "unknown graphql error").join("; "));
    }

    const nodes = payload.data?.events?.nodes ?? [];
    for (const node of nodes) {
      const json = node.contents?.json;
      const assemblyId = extractAssemblyId(json);
      const systemId = extractSystemId(json);
      if (!assemblyId || systemId == null) {
        continue;
      }

      const x = toFiniteNumber(findField(json, ["x"]));
      const y = toFiniteNumber(findField(json, ["y"]));
      const z = toFiniteNumber(findField(json, ["z"]));
      allEntries.set(assemblyId, {
        assemblyId,
        systemId,
        timestamp: node.timestamp,
        txDigest: node.transaction?.digest,
        x: x ?? undefined,
        y: y ?? undefined,
        z: z ?? undefined,
      });
    }

    const pageInfo = payload.data?.events?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) {
      break;
    }
    after = pageInfo.endCursor;
    page += 1;
  }

  return [...allEntries.values()];
}

async function fetchLocationEventsFromRpc(
  rpcUrl: string,
  eventType: string,
  pageSize: number,
  maxPages: number,
): Promise<
  Array<{
    assemblyId: string;
    systemId: number;
    timestamp?: string;
    txDigest?: string;
    x?: number;
    y?: number;
    z?: number;
  }>
> {
  const allEntries = new Map<
    string,
    {
      assemblyId: string;
      systemId: number;
      timestamp?: string;
      txDigest?: string;
      x?: number;
      y?: number;
      z?: number;
    }
  >();

  let cursor: { txDigest?: string; eventSeq?: string } | null = null;
  let page = 0;
  while (page < maxPages) {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "suix_queryEvents",
      params: [{ MoveEventType: eventType }, cursor, pageSize, true],
    };
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`RPC request failed (${response.status})`);
    }
    const payload = (await response.json()) as RpcEventsResponse;
    if (payload.error) {
      throw new Error(payload.error.message || `RPC error ${payload.error.code ?? "unknown"}`);
    }

    const data = payload.result?.data ?? [];
    for (const event of data) {
      const json = event.parsedJson;
      const assemblyId = extractAssemblyId(json);
      const systemId = extractSystemId(json);
      if (!assemblyId || systemId == null) {
        continue;
      }
      const x = toFiniteNumber(findField(json, ["x"]));
      const y = toFiniteNumber(findField(json, ["y"]));
      const z = toFiniteNumber(findField(json, ["z"]));
      const timestamp = event.timestampMs
        ? new Date(Number(event.timestampMs)).toISOString()
        : undefined;
      allEntries.set(assemblyId, {
        assemblyId,
        systemId,
        timestamp,
        txDigest: event.id?.txDigest,
        x: x ?? undefined,
        y: y ?? undefined,
        z: z ?? undefined,
      });
    }

    if (!payload.result?.hasNextPage || !payload.result.nextCursor) {
      break;
    }
    cursor = payload.result.nextCursor;
    page += 1;
  }

  return [...allEntries.values()];
}

async function fetchSystemName(
  worldApiBase: string,
  systemId: number,
  authorizationHeader: string | null,
): Promise<string | null> {
  const url = `${worldApiBase.replace(/\/$/, "")}/v2/solarsystems/${systemId}`;
  const response = await fetch(url, {
    headers: authorizationHeader ? { Authorization: authorizationHeader } : undefined,
  });
  if (!response.ok) {
    return null;
  }
  const payload = (await response.json()) as Record<string, unknown>;
  const directName = payload.name;
  if (typeof directName === "string" && directName.trim().length > 0) {
    return directName.trim();
  }
  const nestedName = findField(payload, ["name", "systemName", "displayName"]);
  return typeof nestedName === "string" && nestedName.trim().length > 0 ? nestedName.trim() : null;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const queryMode =
    (argValue(argv, "--query-mode") || process.env.LINEAGE_LOCATION_QUERY_MODE || "auto").toLowerCase();
  const graphqlUrl =
    argValue(argv, "--graphql-url") ||
    process.env.LINEAGE_SUI_GRAPHQL_URL ||
    "https://sui-testnet.mystenlabs.com/graphql";
  const locationEventType =
    argValue(argv, "--location-event-type") ||
    process.env.LINEAGE_LOCATION_EVENT_TYPE ||
    (process.env.LINEAGE_WORLD_PACKAGE_ID
      ? `${process.env.LINEAGE_WORLD_PACKAGE_ID}::location::LocationRevealedEvent`
      : "0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c::location::LocationRevealedEvent");
  const first = envNumber("LINEAGE_LOCATION_EVENTS_PAGE_SIZE", 50);
  const maxPages = envNumber("LINEAGE_LOCATION_EVENTS_MAX_PAGES", 20);
  const rpcUrl =
    argValue(argv, "--rpc-url") ||
    process.env.LINEAGE_SUI_RPC ||
    "https://fullnode.testnet.sui.io:443";
  const worldApiBase =
    argValue(argv, "--world-api-base") ||
    process.env.LINEAGE_WORLD_API_BASE ||
    "https://world-api-stillness.live.tech.evefrontier.com";
  const worldApiAuthorization =
    argValue(argv, "--world-api-authorization") ||
    process.env.LINEAGE_WORLD_API_AUTHORIZATION ||
    null;
  const mappingOutPath = path.resolve(
    repoRoot,
    argValue(argv, "--assembly-system-output") ||
      process.env.LINEAGE_ASSEMBLY_SYSTEM_OUTPUT_PATH ||
      "verifier/registry/generated/assembly-system-mapping.stillness.json",
  );
  const namesOutPath = path.resolve(
    repoRoot,
    argValue(argv, "--system-names-output") ||
      process.env.LINEAGE_SYSTEM_NAMES_OUTPUT_PATH ||
      "verifier/registry/generated/system-names.stillness.json",
  );

  let entries: Array<{
    assemblyId: string;
    systemId: number;
    timestamp?: string;
    txDigest?: string;
    x?: number;
    y?: number;
    z?: number;
  }> = [];
  let effectiveMode = queryMode;
  if (queryMode === "rpc") {
    entries = await fetchLocationEventsFromRpc(rpcUrl, locationEventType, first, maxPages);
  } else if (queryMode === "graphql") {
    entries = await fetchLocationEvents(graphqlUrl, locationEventType, first, maxPages);
  } else {
    try {
      entries = await fetchLocationEvents(graphqlUrl, locationEventType, first, maxPages);
      effectiveMode = "graphql";
    } catch (error: unknown) {
      console.warn("GraphQL location query failed; falling back to JSON-RPC events.");
      console.warn(error);
      entries = await fetchLocationEventsFromRpc(rpcUrl, locationEventType, first, maxPages);
      effectiveMode = "rpc-fallback";
    }
  }
  const mappingDocument: AssemblySystemMappingDocument = {
    assemblies: entries.map((entry) => ({
      assemblyId: entry.assemblyId,
      systemId: entry.systemId,
      timestamp: entry.timestamp,
      txDigest: entry.txDigest,
      x: entry.x,
      y: entry.y,
      z: entry.z,
    })),
  };

  const uniqueSystemIds = [...new Set(entries.map((entry) => entry.systemId))].sort((a, b) => a - b);
  const nameRecords: SystemNameRecord[] = [];
  for (const systemId of uniqueSystemIds) {
    const name = await fetchSystemName(worldApiBase, systemId, worldApiAuthorization);
    nameRecords.push({
      systemId,
      systemName: name ?? String(systemId),
      source: name ? "world_api" : "fallback_id",
    });
  }

  mkdirSync(path.dirname(mappingOutPath), { recursive: true });
  writeFileSync(mappingOutPath, `${JSON.stringify(mappingDocument, null, 2)}\n`, "utf8");
  mkdirSync(path.dirname(namesOutPath), { recursive: true });
  writeFileSync(
    namesOutPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        worldApiBase,
        systems: nameRecords,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`Wrote assembly->system mappings: ${mappingOutPath}`);
  console.log(`Wrote system names: ${namesOutPath}`);
  console.log(`Assemblies mapped: ${mappingDocument.assemblies.length}`);
  console.log(`Systems named: ${nameRecords.length}`);
  console.log(`Collector mode: ${effectiveMode}`);
}

main().catch((error: unknown) => {
  console.error("fetch-location-events failed.");
  console.error(error);
  process.exit(1);
});
