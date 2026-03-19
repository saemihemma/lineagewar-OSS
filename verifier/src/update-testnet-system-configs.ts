import "dotenv/config";
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

type PublishResult = {
  sender: string;
  rpcUrl: string;
  packageId: string;
  adminCapId: string;
  systemConfigIds: Record<string, string>;
  digests: string[];
};

function argValue(argv: string[], name: string): string | null {
  const prefix = `${name}=`;
  const match = argv.find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function loadSigner(privateKey: string): Ed25519Keypair {
  const parsed = decodeSuiPrivateKey(privateKey);
  if (parsed.scheme !== "ED25519") {
    throw new Error(`LINEAGE_SUI_PRIVATE_KEY must be ED25519, received ${parsed.scheme}`);
  }
  return Ed25519Keypair.fromSecretKey(parsed.secretKey);
}

function objectIdFromResponse(
  response: { objectChanges?: Array<Record<string, unknown>> | null },
  objectType: string,
): string {
  for (const change of response.objectChanges ?? []) {
    if (change["objectType"] === objectType && typeof change["objectId"] === "string") {
      return change["objectId"];
    }
  }
  throw new Error(`Did not find object change for ${objectType}`);
}

async function executeTransaction(
  client: SuiJsonRpcClient,
  signer: Ed25519Keypair,
  tx: Transaction,
): Promise<Awaited<ReturnType<SuiJsonRpcClient["signAndExecuteTransaction"]>>> {
  return client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: {
      showEffects: true,
      showEvents: true,
      showObjectChanges: true,
    },
  });
}

async function publishStorageLensConfig(
  client: SuiJsonRpcClient,
  signer: Ed25519Keypair,
  packageId: string,
  sender: string,
  adminCapId: string,
  effectiveFromMs: number,
) {
  const tx = new Transaction();
  tx.setSender(sender);
  tx.setGasBudget(100_000_000);

  const cfg = tx.moveCall({
    target: `${packageId}::config::publish_system_config_version`,
    arguments: [
      tx.pure.u64(1),
      tx.pure.u64(30020691),
      tx.pure.u64(2),
      tx.pure.bool(true),
      tx.pure.u64(1),
      tx.pure.option("u16", null),
      tx.pure.u16(1),
      tx.pure.u16(1),
      tx.pure.u16(1),
      tx.pure.bool(true),
      tx.pure.u8(2),
      tx.pure.u64(0),
      tx.pure.u64(effectiveFromMs),
      tx.pure.option("u64", null),
      tx.object(adminCapId),
    ],
  });
  tx.moveCall({
    target: `${packageId}::config::allow_assembly_family`,
    arguments: [cfg, tx.object(adminCapId), tx.pure.u8(0)],
  });
  tx.moveCall({
    target: `${packageId}::config::allow_assembly_type`,
    arguments: [cfg, tx.object(adminCapId), tx.pure.u64(88082)],
  });
  tx.moveCall({
    target: `${packageId}::config::allow_storage_type`,
    arguments: [cfg, tx.object(adminCapId), tx.pure.u64(88082)],
  });
  tx.moveCall({
    target: `${packageId}::config::require_item_type`,
    arguments: [cfg, tx.object(adminCapId), tx.pure.u64(1000000038887)],
  });
  tx.moveCall({
    target: `${packageId}::config::share_system_config_version`,
    arguments: [cfg],
  });

  const response = await executeTransaction(client, signer, tx);
  return {
    digest: response.digest,
    systemConfigId: objectIdFromResponse(response, `${packageId}::config::SystemConfigVersion`),
  };
}

async function publishGateOnlyConfig(
  client: SuiJsonRpcClient,
  signer: Ed25519Keypair,
  packageId: string,
  sender: string,
  adminCapId: string,
  effectiveFromMs: number,
) {
  const tx = new Transaction();
  tx.setSender(sender);
  tx.setGasBudget(100_000_000);

  const cfg = tx.moveCall({
    target: `${packageId}::config::publish_system_config_version`,
    arguments: [
      tx.pure.u64(1),
      tx.pure.u64(30017227),
      tx.pure.u64(2),
      tx.pure.bool(true),
      tx.pure.u64(3),
      tx.pure.option("u16", null),
      tx.pure.u16(1),
      tx.pure.u16(1),
      tx.pure.u16(1),
      tx.pure.bool(true),
      tx.pure.u8(0),
      tx.pure.u64(0),
      tx.pure.u64(effectiveFromMs),
      tx.pure.option("u64", null),
      tx.object(adminCapId),
    ],
  });
  tx.moveCall({
    target: `${packageId}::config::allow_assembly_family`,
    arguments: [cfg, tx.object(adminCapId), tx.pure.u8(1)],
  });
  tx.moveCall({
    target: `${packageId}::config::allow_assembly_type`,
    arguments: [cfg, tx.object(adminCapId), tx.pure.u64(88086)],
  });
  tx.moveCall({
    target: `${packageId}::config::share_system_config_version`,
    arguments: [cfg],
  });

  const response = await executeTransaction(client, signer, tx);
  return {
    digest: response.digest,
    systemConfigId: objectIdFromResponse(response, `${packageId}::config::SystemConfigVersion`),
  };
}

async function publishGateAndStorageConfig(
  client: SuiJsonRpcClient,
  signer: Ed25519Keypair,
  packageId: string,
  sender: string,
  adminCapId: string,
  effectiveFromMs: number,
) {
  const tx = new Transaction();
  tx.setSender(sender);
  tx.setGasBudget(100_000_000);

  const cfg = tx.moveCall({
    target: `${packageId}::config::publish_system_config_version`,
    arguments: [
      tx.pure.u64(1),
      tx.pure.u64(30005277),
      tx.pure.u64(2),
      tx.pure.bool(true),
      tx.pure.u64(5),
      tx.pure.option("u16", null),
      tx.pure.u16(1),
      tx.pure.u16(1),
      tx.pure.u16(1),
      tx.pure.bool(true),
      tx.pure.u8(0),
      tx.pure.u64(0),
      tx.pure.u64(effectiveFromMs),
      tx.pure.option("u64", null),
      tx.object(adminCapId),
    ],
  });
  tx.moveCall({
    target: `${packageId}::config::allow_assembly_family`,
    arguments: [cfg, tx.object(adminCapId), tx.pure.u8(0)],
  });
  tx.moveCall({
    target: `${packageId}::config::allow_assembly_family`,
    arguments: [cfg, tx.object(adminCapId), tx.pure.u8(1)],
  });
  tx.moveCall({
    target: `${packageId}::config::allow_assembly_type`,
    arguments: [cfg, tx.object(adminCapId), tx.pure.u64(88082)],
  });
  tx.moveCall({
    target: `${packageId}::config::allow_storage_type`,
    arguments: [cfg, tx.object(adminCapId), tx.pure.u64(88082)],
  });
  tx.moveCall({
    target: `${packageId}::config::allow_assembly_type`,
    arguments: [cfg, tx.object(adminCapId), tx.pure.u64(88086)],
  });
  tx.moveCall({
    target: `${packageId}::config::share_system_config_version`,
    arguments: [cfg],
  });

  const response = await executeTransaction(client, signer, tx);
  return {
    digest: response.digest,
    systemConfigId: objectIdFromResponse(response, `${packageId}::config::SystemConfigVersion`),
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const packageId = argValue(argv, "--package-id") || process.env.LINEAGE_PACKAGE_ID;
  const rpcUrl =
    argValue(argv, "--rpc-url") ||
    process.env.LINEAGE_SUI_RPC ||
    getJsonRpcFullnodeUrl("testnet");
  const privateKey = argValue(argv, "--private-key") || process.env.LINEAGE_SUI_PRIVATE_KEY;
  const adminCapId = argValue(argv, "--admin-cap-id") || process.env.LINEAGE_ADMIN_CAP_ID;
  const effectiveFromMs = Number(argValue(argv, "--effective-from-ms") || Date.now());

  if (!packageId || !privateKey || !adminCapId) {
    throw new Error("LINEAGE_PACKAGE_ID, LINEAGE_SUI_PRIVATE_KEY, and LINEAGE_ADMIN_CAP_ID are required");
  }
  if (!Number.isFinite(effectiveFromMs)) {
    throw new Error("effective-from-ms must be a valid number");
  }

  const client = new SuiJsonRpcClient({
    url: rpcUrl,
    network: "testnet",
  });
  const signer = loadSigner(privateKey);
  const sender = signer.toSuiAddress();

  const lens = await publishStorageLensConfig(client, signer, packageId, sender, adminCapId, effectiveFromMs);
  const gate = await publishGateOnlyConfig(client, signer, packageId, sender, adminCapId, effectiveFromMs);
  const convergence = await publishGateAndStorageConfig(
    client,
    signer,
    packageId,
    sender,
    adminCapId,
    effectiveFromMs,
  );

  const result: PublishResult = {
    sender,
    rpcUrl,
    packageId,
    adminCapId,
    systemConfigIds: {
      "30020691": lens.systemConfigId,
      "30017227": gate.systemConfigId,
      "30005277": convergence.systemConfigId,
    },
    digests: [lens.digest, gate.digest, convergence.digest],
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error("System config update failed.");
  console.error(error);
  process.exit(1);
});
