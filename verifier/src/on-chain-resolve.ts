import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { fromBase64 } from "@mysten/sui/utils";

export interface ResolutionResult {
  digest: string;
  warResolutionObjectId: string | null;
  resolvedAtMs: number;
}

async function discoverAdminCapId(
  client: SuiJsonRpcClient,
  walletAddress: string,
  packageId: string,
  warId: number,
): Promise<string> {
  const structType = `${packageId}::registry::WarAdminCap`;
  const response = await client.getOwnedObjects({
    owner: walletAddress,
    filter: { StructType: structType },
    options: { showContent: true },
  });

  for (const entry of response.data ?? []) {
    const fields = (entry.data?.content as { fields?: Record<string, unknown> })?.fields;
    const capWarId = Number(fields?.war_id);
    if (capWarId === warId && entry.data?.objectId) {
      return entry.data.objectId;
    }
  }

  throw new Error(
    `No WarAdminCap found for war ${warId} owned by ${walletAddress}. ` +
    `Ensure the verifier's private key corresponds to the wallet that owns the admin cap.`,
  );
}

export async function submitResolveWarOnChain(opts: {
  rpcUrl: string;
  packageId: string;
  warId: number;
  registryId: string;
  tribeScores: Array<{ tribeId: number; score: number }>;
  adminPrivateKey: string;
}): Promise<ResolutionResult> {
  const { rpcUrl, packageId, warId, registryId, tribeScores, adminPrivateKey } = opts;

  const keypair = keypairFromPrivateKey(adminPrivateKey);
  const walletAddress = keypair.toSuiAddress();
  const client = new SuiJsonRpcClient({ url: rpcUrl, network: "testnet" });

  console.log(`  Resolver wallet: ${walletAddress}`);

  const adminCapId = await discoverAdminCapId(client, walletAddress, packageId, warId);
  console.log(`  Discovered WarAdminCap: ${adminCapId}`);

  const tribeIds = tribeScores.map((s) => s.tribeId);
  const scores = tribeScores.map((s) => s.score);

  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::registry::resolve_war`,
    arguments: [
      tx.object(registryId),
      tx.object(adminCapId),
      tx.pure.vector("u32", tribeIds),
      tx.pure.vector("u64", scores),
      tx.object("0x6"),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showObjectChanges: true, showEvents: true },
  });

  let warResolutionObjectId: string | null = null;
  for (const change of (result as { objectChanges?: Array<{ type: string; objectType?: string; objectId?: string }> }).objectChanges ?? []) {
    if (change.type === "created" && change.objectType?.includes("WarResolution")) {
      warResolutionObjectId = change.objectId ?? null;
      break;
    }
  }

  const digest = (result as { digest?: string }).digest ?? "unknown";

  console.log(`  resolve_war tx: ${digest}`);
  if (warResolutionObjectId) {
    console.log(`  WarResolution object: ${warResolutionObjectId}`);
  }

  return {
    digest,
    warResolutionObjectId,
    resolvedAtMs: Date.now(),
  };
}

function keypairFromPrivateKey(key: string): Ed25519Keypair {
  const trimmed = key.trim();
  if (trimmed.startsWith("suiprivkey")) {
    return Ed25519Keypair.fromSecretKey(trimmed);
  }
  try {
    const bytes = fromBase64(trimmed);
    return Ed25519Keypair.fromSecretKey(bytes);
  } catch {
    return Ed25519Keypair.fromSecretKey(trimmed);
  }
}

export async function submitResolveWarWithRetry(opts: {
  rpcUrl: string;
  packageId: string;
  warId: number;
  registryId: string;
  tribeScores: Array<{ tribeId: number; score: number }>;
  adminPrivateKey: string;
}): Promise<ResolutionResult | null> {
  const maxRetries = 3;
  const backoffMs = [2000, 4000, 8000];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`  [Retry ${attempt}/${maxRetries}] Submitting resolve_war transaction...`);
      const result = await submitResolveWarOnChain(opts);
      console.log(`  [Retry ${attempt}/${maxRetries}] Success!`);
      return result;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`  [Retry ${attempt}/${maxRetries}] Failed: ${errMsg}`);

      if (attempt < maxRetries) {
        const delayMs = backoffMs[attempt - 1];
        console.log(`  Waiting ${delayMs}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  console.error(`  All ${maxRetries} retry attempts exhausted. Returning null.`);
  return null;
}
