import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import path from "node:path";
import { deriveTickReceiptPath } from "./artifact-output.js";
import { buildCommitManifest, loadSnapshotEnvelope } from "./commit-manifest.js";

function argValue(argv: string[], name: string): string | null {
  const prefix = `${name}=`;
  const match = argv.find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function hexToBytes(hex: string): number[] {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (normalized.length % 2 !== 0) {
    throw new Error(`snapshot hash must have an even number of hex characters: ${hex}`);
  }

  const bytes: number[] = [];
  for (let index = 0; index < normalized.length; index += 2) {
    bytes.push(Number.parseInt(normalized.slice(index, index + 2), 16));
  }
  return bytes;
}

function loadSigner(privateKey: string): Ed25519Keypair {
  const parsed = decodeSuiPrivateKey(privateKey);
  if (parsed.scheme !== "ED25519") {
    throw new Error(`LINEAGE_SUI_PRIVATE_KEY must be ED25519, received ${parsed.scheme}`);
  }
  return Ed25519Keypair.fromSecretKey(parsed.secretKey);
}

function buildCommitTransaction(
  entry: ReturnType<typeof buildCommitManifest>[number],
  sender: string,
): Transaction {
  if (!entry.args.snapshotHashHex) {
    throw new Error(`System ${entry.args.systemId} is missing snapshotHashHex`);
  }

  const tx = new Transaction();
  tx.setSender(sender);
  tx.setGasBudgetIfNotSet(100_000_000);
  tx.moveCall({
    target: entry.target,
    arguments: [
      tx.pure.u64(entry.args.warId),
      tx.pure.u64(entry.args.systemId),
      tx.pure.u64(entry.args.tickTimestampMs),
      tx.pure.u8(entry.args.state),
      tx.pure.option("u32", entry.args.controllerTribeId),
      tx.pure.u64(entry.args.pointsAwarded),
      tx.pure.id(entry.args.configVersionId),
      tx.pure.vector("u8", hexToBytes(entry.args.snapshotHashHex)),
      tx.object(entry.adminCapId),
    ],
  });
  return tx;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const inputPath =
    argValue(argv, "--input") ||
    process.env.LINEAGE_COMMIT_INPUT ||
    "../frontend/score/public/verifier/live.json";
  const packageId = argValue(argv, "--package-id") || process.env.LINEAGE_PACKAGE_ID;
  const adminCapId = argValue(argv, "--admin-cap-id") || process.env.LINEAGE_ADMIN_CAP_ID;
  const rpcUrl =
    argValue(argv, "--rpc-url") ||
    process.env.LINEAGE_SUI_RPC ||
    getJsonRpcFullnodeUrl("testnet");
  const privateKey = argValue(argv, "--private-key") || process.env.LINEAGE_SUI_PRIVATE_KEY;
  const execute = argv.includes("--execute");

  if (!packageId || !adminCapId || !privateKey) {
    throw new Error(
      "LINEAGE_PACKAGE_ID, LINEAGE_ADMIN_CAP_ID, and LINEAGE_SUI_PRIVATE_KEY are required",
    );
  }

  const client = new SuiJsonRpcClient({
    url: rpcUrl,
    network: "testnet",
  });
  const signer = loadSigner(privateKey);
  const envelope = await loadSnapshotEnvelope(inputPath);
  const manifest = buildCommitManifest(packageId, adminCapId, envelope);
  const sender = signer.toSuiAddress();
  const results = [];

  for (const entry of manifest) {
    const transaction = buildCommitTransaction(entry, sender);
    if (execute) {
      const response = await client.signAndExecuteTransaction({
        signer,
        transaction,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });
      results.push({
        mode: "execute",
        systemId: entry.args.systemId,
        tickTimestampMs: entry.args.tickTimestampMs,
        digest: response.digest,
        effects: response.effects?.status ?? null,
      });
      continue;
    }

    const transactionBlock = await transaction.build({ client });
    const response = await client.dryRunTransactionBlock({ transactionBlock });
    results.push({
      mode: "dry-run",
      systemId: entry.args.systemId,
      tickTimestampMs: entry.args.tickTimestampMs,
      effects: response.effects.status,
      balanceChanges: response.balanceChanges ?? [],
    });
  }

  console.log(
    JSON.stringify(
      {
        inputPath,
        rpcUrl,
        sender,
        mode: execute ? "execute" : "dry-run",
        manifestCount: manifest.length,
        results,
      },
      null,
      2,
    ),
  );

  const resultsByTick = new Map<number, typeof results>();
  for (const result of results) {
    const atTick = resultsByTick.get(result.tickTimestampMs) ?? [];
    atTick.push(result);
    resultsByTick.set(result.tickTimestampMs, atTick);
  }

  for (const [tickTimestampMs, tickResults] of resultsByTick) {
    const receiptPath = deriveTickReceiptPath(inputPath, tickTimestampMs);
    await mkdir(path.dirname(receiptPath), { recursive: true });
    await writeFile(
      receiptPath,
      JSON.stringify(
        {
          artifactVersion: 1,
          generatedAtMs: Date.now(),
          inputPath,
          rpcUrl,
          sender,
          mode: execute ? "execute" : "dry-run",
          tickTimestampMs,
          manifestCount: tickResults.length,
          results: tickResults,
        },
        null,
        2,
      ),
      "utf8",
    );
  }
}

main().catch((error: unknown) => {
  console.error("Submit commit failed.");
  console.error(error);
  process.exit(1);
});
