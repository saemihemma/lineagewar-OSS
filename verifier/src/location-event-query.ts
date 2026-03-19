/**
 * Reusable location event query functions.
 * Extracted from fetch-location-events.ts for use in the verifier loop.
 */

export type LocationEntry = {
  assemblyId: string;
  systemId: number;
  timestamp?: string;
  txDigest?: string;
};

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

function normalizeObjectId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("0x") && trimmed.length >= 8 ? trimmed : null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
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
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    if (Array.isArray(current)) {
      for (const entry of current) queue.push(entry);
      continue;
    }
    for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
      const match = visit(key, value);
      if (match !== undefined) return match;
      queue.push(value);
    }
  }
  return null;
}

function findField(root: unknown, keys: string[]): unknown | null {
  const normalized = keys.map((e) => e.toLowerCase());
  return walk(root, (key, value) => {
    if (normalized.includes(key.toLowerCase())) return value;
    return undefined;
  }) as unknown | null;
}

function extractAssemblyId(json: unknown): string | null {
  const direct = findField(json, ["assembly_id", "assemblyId", "object_id", "objectId", "entity_id", "entityId"]);
  return normalizeObjectId(direct) ?? normalizeObjectId(findField(json, ["id"]));
}

function extractSystemId(json: unknown): number | null {
  return toFiniteNumber(findField(json, ["solarsystem", "solarSystem", "system_id", "systemId"]));
}

export async function queryLocationEventsGraphql(
  graphqlUrl: string,
  eventType: string,
  pageSize: number,
  maxPages: number,
  warSystemIds?: Set<number>,
): Promise<LocationEntry[]> {
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

  const entries = new Map<string, LocationEntry>();
  let after: string | null = null;
  let page = 0;

  while (page < maxPages) {
    const response = await fetch(graphqlUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables: { locationEventType: eventType, first: pageSize, after } }),
    });
    if (!response.ok) throw new Error(`GraphQL request failed (${response.status})`);
    const payload = (await response.json()) as GraphqlResponse;
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((e) => e.message ?? "unknown").join("; "));
    }

    for (const node of payload.data?.events?.nodes ?? []) {
      const json = node.contents?.json;
      const assemblyId = extractAssemblyId(json);
      const systemId = extractSystemId(json);
      if (!assemblyId || systemId == null) continue;
      if (warSystemIds && warSystemIds.size > 0 && !warSystemIds.has(systemId)) continue;
      entries.set(assemblyId, { assemblyId, systemId, timestamp: node.timestamp, txDigest: node.transaction?.digest });
    }

    const pageInfo = payload.data?.events?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    after = pageInfo.endCursor;
    page += 1;
  }

  return [...entries.values()];
}

export async function queryLocationEventsRpc(
  rpcUrl: string,
  eventType: string,
  pageSize: number,
  maxPages: number,
  warSystemIds?: Set<number>,
): Promise<LocationEntry[]> {
  const entries = new Map<string, LocationEntry>();
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
    if (!response.ok) throw new Error(`RPC request failed (${response.status})`);
    const payload = (await response.json()) as RpcEventsResponse;
    if (payload.error) throw new Error(payload.error.message || `RPC error ${payload.error.code ?? "unknown"}`);

    for (const event of payload.result?.data ?? []) {
      const json = event.parsedJson;
      const assemblyId = extractAssemblyId(json);
      const systemId = extractSystemId(json);
      if (!assemblyId || systemId == null) continue;
      if (warSystemIds && warSystemIds.size > 0 && !warSystemIds.has(systemId)) continue;
      const timestamp = event.timestampMs ? new Date(Number(event.timestampMs)).toISOString() : undefined;
      entries.set(assemblyId, { assemblyId, systemId, timestamp, txDigest: event.id?.txDigest });
    }

    if (!payload.result?.hasNextPage || !payload.result.nextCursor) break;
    cursor = payload.result.nextCursor;
    page += 1;
  }

  return [...entries.values()];
}

export async function queryLocationEvents(
  mode: "auto" | "graphql" | "rpc",
  graphqlUrl: string,
  rpcUrl: string,
  eventType: string,
  pageSize: number,
  maxPages: number,
  warSystemIds?: Set<number>,
): Promise<{ entries: LocationEntry[]; effectiveMode: string }> {
  if (mode === "rpc") {
    return { entries: await queryLocationEventsRpc(rpcUrl, eventType, pageSize, maxPages, warSystemIds), effectiveMode: "rpc" };
  }
  if (mode === "graphql") {
    return { entries: await queryLocationEventsGraphql(graphqlUrl, eventType, pageSize, maxPages, warSystemIds), effectiveMode: "graphql" };
  }
  try {
    const entries = await queryLocationEventsGraphql(graphqlUrl, eventType, pageSize, maxPages, warSystemIds);
    return { entries, effectiveMode: "graphql" };
  } catch {
    const entries = await queryLocationEventsRpc(rpcUrl, eventType, pageSize, maxPages, warSystemIds);
    return { entries, effectiveMode: "rpc-fallback" };
  }
}
