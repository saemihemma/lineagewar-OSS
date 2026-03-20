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

async function graphqlPost(graphqlUrl: string, query: string): Promise<GraphqlBatchResponse> {
  const response = await fetch(graphqlUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as GraphqlBatchResponse;
  if (payload.errors?.length) {
    const msgs = payload.errors.map((e) => e.message ?? "unknown").join("; ");
    throw new Error(`GraphQL errors: ${msgs}`);
  }

  return payload;
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

  const payloads = await Promise.all(
    chunks.map((c) => graphqlPost(graphqlUrl, c.query)),
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
