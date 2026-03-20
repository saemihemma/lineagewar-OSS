/**
 * Pure-GraphQL per-tick pipeline for resolving assemblies to tribe ownership.
 *
 * 3 batched alias queries, no caching, no RPC:
 *   1. Assembly objects → live state + owner_cap_id
 *   2. OwnerCap objects → wallet address (AddressOwner)
 *   3. Character objects at wallet address → tribe_id
 *
 * Character object address == wallet address on Stillness (verified empirically).
 */

const BATCH_SIZE = 20;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_CONCURRENCY = 3;

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GraphqlAssemblyResolutionError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean, cause?: unknown) {
    super(message);
    this.name = "GraphqlAssemblyResolutionError";
    this.retryable = retryable;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export interface GraphqlAssemblyState {
  assemblyId: string;
  json: Record<string, unknown> | null;
  typeRepr: string | null;
  ownerCapId: string | null;
  wallet: string | null;
  tribeId: number | null;
  characterTenant: string | null;
}

type GraphqlObjectResult = {
  address?: string;
  asMoveObject?: {
    contents?: {
      json?: Record<string, unknown>;
      type?: { repr?: string };
    };
  };
  owner?: {
    __typename?: string;
    address?: { address?: string };
    initialSharedVersion?: number;
  };
};

type GraphqlBatchResponse = {
  data?: Record<string, GraphqlObjectResult | null>;
  errors?: Array<{ message?: string }>;
};

const ASSEMBLY_FRAGMENT = `
  address
  asMoveObject {
    contents {
      json
      type { repr }
    }
  }
  owner {
    __typename
    ... on AddressOwner { address { address } }
    ... on Shared { initialSharedVersion }
  }
`;

const OWNER_CAP_FRAGMENT = `
  asMoveObject {
    contents { json }
  }
  owner {
    __typename
    ... on AddressOwner { address { address } }
  }
`;

const CHARACTER_FRAGMENT = `
  asMoveObject {
    contents { json }
  }
`;

function buildRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function backoffDelayMs(attempt: number): number {
  const cappedAttempt = Math.max(0, attempt - 1);
  const base = Math.min(2_500, 250 * (2 ** cappedAttempt));
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

async function graphqlPostOnce(graphqlUrl: string, query: string): Promise<GraphqlBatchResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), envNumber("LINEAGE_GRAPHQL_TIMEOUT_MS", DEFAULT_TIMEOUT_MS));

  let response: Response;
  try {
    response = await fetch(graphqlUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
      signal: controller.signal,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "GraphQL request timed out"
        : `GraphQL request failed before response: ${error instanceof Error ? error.message : String(error)}`;
    throw new GraphqlAssemblyResolutionError(message, true, error);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new GraphqlAssemblyResolutionError(
      `GraphQL request failed: ${response.status} ${response.statusText}`,
      buildRetryableStatus(response.status),
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new GraphqlAssemblyResolutionError("GraphQL response was not valid JSON", false, error);
  }

  if (!payload || typeof payload !== "object") {
    throw new GraphqlAssemblyResolutionError("GraphQL response body was malformed", false);
  }

  const typedPayload = payload as GraphqlBatchResponse;
  if (!typedPayload.data && !typedPayload.errors) {
    throw new GraphqlAssemblyResolutionError("GraphQL response did not include data or errors", false);
  }

  if (typedPayload.errors?.length) {
    const msgs = typedPayload.errors.map((e) => e.message ?? "unknown").join("; ");
    throw new GraphqlAssemblyResolutionError(`GraphQL errors: ${msgs}`, true);
  }

  return typedPayload;
}

async function graphqlPost(graphqlUrl: string, query: string): Promise<GraphqlBatchResponse> {
  const maxAttempts = envNumber("LINEAGE_GRAPHQL_MAX_ATTEMPTS", DEFAULT_MAX_ATTEMPTS);

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await graphqlPostOnce(graphqlUrl, query);
    } catch (error) {
      lastError = error;
      const typed =
        error instanceof GraphqlAssemblyResolutionError
          ? error
          : new GraphqlAssemblyResolutionError(
            error instanceof Error ? error.message : String(error),
            true,
            error,
          );

      if (!typed.retryable || attempt === maxAttempts) {
        throw new GraphqlAssemblyResolutionError(
          `GraphQL ownership resolution failed after ${attempt} attempt(s): ${typed.message}`,
          typed.retryable,
          typed,
        );
      }

      await sleep(backoffDelayMs(attempt));
    }
  }

  throw new GraphqlAssemblyResolutionError(
    `GraphQL ownership resolution failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    true,
    lastError,
  );
}

async function mapWithConcurrency<T, U>(
  items: T[],
  limit: number,
  mapFn: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  const results = new Array<U>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        return;
      }
      results[currentIndex] = await mapFn(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function buildAliasQuery(ids: string[], fragment: string, prefix: string): string {
  const aliases = ids.map(
    (id, i) => `${prefix}${i}: object(address: "${id}") { ${fragment} }`,
  );
  return `query { ${aliases.join("\n")} }`;
}

function extractResults<T>(
  payload: GraphqlBatchResponse,
  count: number,
  prefix: string,
): (T | null)[] {
  const results: (T | null)[] = [];
  for (let i = 0; i < count; i++) {
    results.push((payload.data?.[`${prefix}${i}`] as T | undefined) ?? null);
  }
  return results;
}

async function batchQuery<T>(
  graphqlUrl: string,
  ids: string[],
  fragment: string,
  prefix: string,
): Promise<(T | null)[]> {
  if (ids.length === 0) return [];

  const chunks: { offset: number; count: number; query: string }[] = [];
  for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
    const chunk = ids.slice(offset, offset + BATCH_SIZE);
    chunks.push({ offset, count: chunk.length, query: buildAliasQuery(chunk, fragment, prefix) });
  }

  const payloads = await mapWithConcurrency(
    chunks,
    envNumber("LINEAGE_GRAPHQL_BATCH_CONCURRENCY", DEFAULT_CONCURRENCY),
    (chunk) => graphqlPost(graphqlUrl, chunk.query),
  );

  const allResults: (T | null)[] = [];
  for (let i = 0; i < chunks.length; i++) {
    allResults.push(...extractResults<T>(payloads[i], chunks[i].count, prefix));
  }
  return allResults;
}

/**
 * Resolve a set of assembly IDs to their full ownership chain via GraphQL.
 *
 * All 3 batches always run live -- no caching.
 *   1. Assembly objects -> live state + owner_cap_id
 *   2. OwnerCap objects -> wallet address
 *   3. Character objects -> tribe_id
 */
export async function resolveAssembliesViaGraphQL(
  graphqlUrl: string,
  assemblyIds: string[],
): Promise<Map<string, GraphqlAssemblyState>> {
  const result = new Map<string, GraphqlAssemblyState>();
  if (assemblyIds.length === 0) return result;

  const normalizedIds = assemblyIds.map((id) => id.toLowerCase());

  // Batch 1: Assembly objects -> live state + owner_cap_id
  const assemblyResults = await batchQuery<GraphqlObjectResult>(
    graphqlUrl,
    normalizedIds,
    ASSEMBLY_FRAGMENT,
    "a",
  );

  const stateByAssembly = new Map<string, GraphqlAssemblyState>();
  const capIds: string[] = [];
  const capToAssemblyIds: string[] = [];

  for (let i = 0; i < normalizedIds.length; i++) {
    const asmId = normalizedIds[i];
    const obj = assemblyResults[i];
    const json = obj?.asMoveObject?.contents?.json ?? null;
    const typeRepr = obj?.asMoveObject?.contents?.type?.repr ?? null;
    const ownerCapId =
      typeof json?.owner_cap_id === "string" && (json.owner_cap_id as string).startsWith("0x")
        ? (json.owner_cap_id as string)
        : null;

    const state: GraphqlAssemblyState = {
      assemblyId: asmId,
      json,
      typeRepr,
      ownerCapId,
      wallet: null,
      tribeId: null,
      characterTenant: null,
    };
    stateByAssembly.set(asmId, state);

    if (ownerCapId) {
      capIds.push(ownerCapId);
      capToAssemblyIds.push(asmId);
    }
  }

  // Batch 2: OwnerCap objects -> wallet address
  const walletAddresses: string[] = [];
  const walletToAssemblyIds: string[] = [];

  if (capIds.length > 0) {
    const capResults = await batchQuery<GraphqlObjectResult>(
      graphqlUrl,
      capIds,
      OWNER_CAP_FRAGMENT,
      "c",
    );

    for (let i = 0; i < capIds.length; i++) {
      const cap = capResults[i];
      const wallet = cap?.owner?.address?.address ?? null;
      const asmId = capToAssemblyIds[i];
      const state = stateByAssembly.get(asmId);
      if (state && wallet) {
        state.wallet = wallet;
        walletAddresses.push(wallet);
        walletToAssemblyIds.push(asmId);
      }
    }
  }

  if (walletAddresses.length === 0) {
    for (const [, state] of stateByAssembly) result.set(state.assemblyId, state);
    return result;
  }

  // Batch 3: Character objects -> tribe_id
  const uniqueWallets = [...new Set(walletAddresses)];
  const charResults = await batchQuery<GraphqlObjectResult>(
    graphqlUrl,
    uniqueWallets,
    CHARACTER_FRAGMENT,
    "ch",
  );

  const tribeByWallet = new Map<string, { tribeId: number; tenant: string | null }>();
  for (let i = 0; i < uniqueWallets.length; i++) {
    const char = charResults[i];
    const charJson = char?.asMoveObject?.contents?.json;
    const tribeId = Number(charJson?.tribe_id);
    if (Number.isFinite(tribeId) && tribeId > 0) {
      const tenant = (charJson?.key as Record<string, unknown> | undefined)?.tenant;
      tribeByWallet.set(uniqueWallets[i], {
        tribeId,
        tenant: typeof tenant === "string" ? tenant : null,
      });
    }
  }

  for (const [, state] of stateByAssembly) {
    if (state.wallet) {
      const charInfo = tribeByWallet.get(state.wallet);
      if (charInfo) {
        state.tribeId = charInfo.tribeId;
        state.characterTenant = charInfo.tenant;
      }
    }
    result.set(state.assemblyId, state);
  }

  return result;
}
