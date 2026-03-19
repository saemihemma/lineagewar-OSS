import "dotenv/config";
import { readFileSync } from "node:fs";
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

type AllowedFamily = { family: number; weight: number };
type AllowedType = { typeId: number; weight: number };

type SystemDefinition = {
  systemId: number;
  displayName: string;
  priorityClass: number;
  pointsPerTick: number;
  storageRequirementMode: number;
  allowedFamilies: AllowedFamily[];
  allowedAssemblyTypes: AllowedType[];
  allowedStorageTypes: number[];
  requiredItemTypes: number[];
};

type SetupResult = {
  sender: string;
  rpcUrl: string;
  packageId: string;
  warRegistryId: string;
  adminCapId: string;
  warConfigId: string;
  phaseConfigId: string;
  systemIds: Record<string, string>;
  systemConfigIds: Record<string, string>;
  digests: string[];
};

const DEFAULT_SYSTEMS: SystemDefinition[] = [
  {
    systemId: 30020691,
    displayName: "Lens Cache",
    priorityClass: 1,
    pointsPerTick: 1,
    storageRequirementMode: 2,
    allowedFamilies: [{ family: 0, weight: 1 }],
    allowedAssemblyTypes: [{ typeId: 88082, weight: 1 }],
    allowedStorageTypes: [88082],
    requiredItemTypes: [1000000038887],
  },
  {
    systemId: 30017227,
    displayName: "Gate Line",
    priorityClass: 2,
    pointsPerTick: 3,
    storageRequirementMode: 0,
    allowedFamilies: [{ family: 1, weight: 1 }],
    allowedAssemblyTypes: [{ typeId: 88086, weight: 1 }],
    allowedStorageTypes: [],
    requiredItemTypes: [],
  },
  {
    systemId: 30005277,
    displayName: "Convergence",
    priorityClass: 3,
    pointsPerTick: 5,
    storageRequirementMode: 0,
    allowedFamilies: [{ family: 0, weight: 1 }, { family: 1, weight: 1 }],
    allowedAssemblyTypes: [{ typeId: 88082, weight: 1 }, { typeId: 88086, weight: 1 }],
    allowedStorageTypes: [88082],
    requiredItemTypes: [],
  },
];

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

async function createWar(
  client: SuiJsonRpcClient,
  signer: Ed25519Keypair,
  packageId: string,
  sender: string,
  createdAtMs: number,
  warId: number,
) {
  const tx = new Transaction();
  tx.setSender(sender);
  tx.setGasBudget(100_000_000);

  const [warRegistry, adminCap] = tx.moveCall({
    target: `${packageId}::registry::create_war`,
    arguments: [
      tx.pure.u64(warId),
      tx.pure.string("lineage-war"),
      tx.pure.string("The Lineage War"),
      tx.pure.u16(2),
      tx.pure.u8(2),
      tx.pure.u64(0),
      tx.pure.u64(createdAtMs),
    ],
  });

  tx.moveCall({
    target: `${packageId}::registry::share_war_registry`,
    arguments: [warRegistry],
  });
  tx.transferObjects([adminCap], tx.pure.address(sender));

  const response = await executeTransaction(client, signer, tx);
  return {
    digest: response.digest,
    warRegistryId: objectIdFromResponse(response, `${packageId}::registry::WarRegistry`),
    adminCapId: objectIdFromResponse(response, `${packageId}::registry::WarAdminCap`),
  };
}

async function publishDefaults(
  client: SuiJsonRpcClient,
  signer: Ed25519Keypair,
  packageId: string,
  sender: string,
  adminCapId: string,
  effectiveFromMs: number,
  warId: number,
) {
  const tx = new Transaction();
  tx.setSender(sender);
  tx.setGasBudget(100_000_000);
  tx.moveCall({
    target: `${packageId}::admin::publish_initial_defaults`,
    arguments: [
      tx.pure.u64(warId),
      tx.pure.u64(2),
      tx.pure.u16(60),
      tx.pure.u64(1),
      tx.pure.u16(1),
      tx.pure.u16(1),
      tx.pure.u16(1),
      tx.pure.bool(true),
      tx.pure.u8(2),
      tx.pure.u64(effectiveFromMs),
      tx.pure.option("u64", null),
      tx.object(adminCapId),
    ],
  });

  const response = await executeTransaction(client, signer, tx);
  return {
    digest: response.digest,
    warConfigId: objectIdFromResponse(response, `${packageId}::config::WarConfigVersion`),
  };
}

async function publishPhase(
  client: SuiJsonRpcClient,
  signer: Ed25519Keypair,
  packageId: string,
  sender: string,
  adminCapId: string,
  effectiveFromMs: number,
  warId: number,
) {
  const tx = new Transaction();
  tx.setSender(sender);
  tx.setGasBudget(100_000_000);

  const phaseConfig = tx.moveCall({
    target: `${packageId}::config::publish_phase_config`,
    arguments: [
      tx.pure.u64(warId),
      tx.pure.u64(1),
      tx.pure.string("Opening Front"),
      tx.pure.option("u16", null),
      tx.pure.u64(10_000),
      tx.pure.u64(effectiveFromMs),
      tx.pure.option("u64", null),
      tx.object(adminCapId),
    ],
  });

  tx.moveCall({
    target: `${packageId}::config::share_phase_config`,
    arguments: [phaseConfig],
  });

  const response = await executeTransaction(client, signer, tx);
  return {
    digest: response.digest,
    phaseConfigId: objectIdFromResponse(response, `${packageId}::config::PhaseConfig`),
  };
}

async function createSystem(
  client: SuiJsonRpcClient,
  signer: Ed25519Keypair,
  packageId: string,
  sender: string,
  adminCapId: string,
  effectiveFromMs: number,
  warId: number,
  def: SystemDefinition,
) {
  const tx = new Transaction();
  tx.setSender(sender);
  tx.setGasBudget(100_000_000);

  const system = tx.moveCall({
    target: `${packageId}::systems::register_system`,
    arguments: [
      tx.pure.u64(warId),
      tx.pure.u64(def.systemId),
      tx.pure.string(def.displayName),
      tx.pure.u8(def.priorityClass),
      tx.pure.bool(true),
      tx.object(adminCapId),
    ],
  });
  tx.moveCall({
    target: `${packageId}::systems::share_system`,
    arguments: [system],
  });

  const cfg = tx.moveCall({
    target: `${packageId}::config::publish_system_config_version`,
    arguments: [
      tx.pure.u64(warId),
      tx.pure.u64(def.systemId),
      tx.pure.u64(1),
      tx.pure.bool(true),
      tx.pure.u64(def.pointsPerTick),
      tx.pure.option("u16", null),
      tx.pure.u16(1),
      tx.pure.u16(1),
      tx.pure.u16(1),
      tx.pure.bool(true),
      tx.pure.u8(def.storageRequirementMode),
      tx.pure.u64(0),
      tx.pure.u64(effectiveFromMs),
      tx.pure.option("u64", null),
      tx.object(adminCapId),
    ],
  });

  for (const { family, weight } of def.allowedFamilies) {
    tx.moveCall({
      target: `${packageId}::config::allow_assembly_family`,
      arguments: [cfg, tx.object(adminCapId), tx.pure.u8(family), tx.pure.u64(weight)],
    });
  }
  for (const { typeId, weight } of def.allowedAssemblyTypes) {
    tx.moveCall({
      target: `${packageId}::config::allow_assembly_type`,
      arguments: [cfg, tx.object(adminCapId), tx.pure.u64(typeId), tx.pure.u64(weight)],
    });
  }
  for (const typeId of def.allowedStorageTypes) {
    tx.moveCall({
      target: `${packageId}::config::allow_storage_type`,
      arguments: [cfg, tx.object(adminCapId), tx.pure.u64(typeId)],
    });
  }
  for (const typeId of def.requiredItemTypes) {
    tx.moveCall({
      target: `${packageId}::config::require_item_type`,
      arguments: [cfg, tx.object(adminCapId), tx.pure.u64(typeId)],
    });
  }

  tx.moveCall({
    target: `${packageId}::config::share_system_config_version`,
    arguments: [cfg],
  });

  const response = await executeTransaction(client, signer, tx);
  return {
    digest: response.digest,
    systemId: objectIdFromResponse(response, `${packageId}::systems::WarSystem`),
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
  const warId = Number(argValue(argv, "--war-id") || "11");
  const createdAtMs = Number(argValue(argv, "--created-at-ms") || Date.now());
  const effectiveFromMs = Number(argValue(argv, "--effective-from-ms") || 0);

  if (!packageId || !privateKey) {
    throw new Error("LINEAGE_PACKAGE_ID and LINEAGE_SUI_PRIVATE_KEY are required");
  }
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(effectiveFromMs)) {
    throw new Error("created-at-ms and effective-from-ms must be valid numbers");
  }

  const systemsPath = argValue(argv, "--systems-file");
  const systems: SystemDefinition[] = systemsPath
    ? JSON.parse(readFileSync(systemsPath, "utf8"))
    : DEFAULT_SYSTEMS;

  const skipCreateWar = argv.includes("--skip-create-war");
  const skipConfigs = argv.includes("--skip-configs");
  const skipSystems = argv.includes("--skip-systems");
  const existingAdminCapId = argValue(argv, "--admin-cap-id");
  const existingRegistryId = argValue(argv, "--registry-id");

  const client = new SuiJsonRpcClient({
    url: rpcUrl,
    network: "testnet",
  });
  const signer = loadSigner(privateKey);
  const sender = signer.toSuiAddress();

  let adminCapId: string;
  let warRegistryId: string;
  const digests: string[] = [];

  if (skipCreateWar) {
    if (!existingAdminCapId || !existingRegistryId) {
      throw new Error("--admin-cap-id and --registry-id are required when using --skip-create-war");
    }
    adminCapId = existingAdminCapId;
    warRegistryId = existingRegistryId;
    console.log("Skipping war creation, using existing admin cap:", adminCapId);
  } else {
    const createWarResult = await createWar(client, signer, packageId, sender, createdAtMs, warId);
    adminCapId = createWarResult.adminCapId;
    warRegistryId = createWarResult.warRegistryId;
    digests.push(createWarResult.digest);
  }

  let warConfigId = "";
  let phaseConfigId = "";

  if (!skipConfigs) {
    const publishDefaultsResult = await publishDefaults(
      client, signer, packageId, sender, adminCapId, effectiveFromMs, warId,
    );
    digests.push(publishDefaultsResult.digest);
    warConfigId = publishDefaultsResult.warConfigId;

    const publishPhaseResult = await publishPhase(
      client, signer, packageId, sender, adminCapId, effectiveFromMs, warId,
    );
    digests.push(publishPhaseResult.digest);
    phaseConfigId = publishPhaseResult.phaseConfigId;
  } else {
    console.log("Skipping config and phase publishing");
  }

  const systemIds: Record<string, string> = {};
  const systemConfigIds: Record<string, string> = {};

  if (!skipSystems) {
    for (const def of systems) {
      console.log(`Creating system ${def.systemId} (${def.displayName})...`);
      const result = await createSystem(
        client, signer, packageId, sender, adminCapId, effectiveFromMs, warId, def,
      );
      systemIds[String(def.systemId)] = result.systemId;
      systemConfigIds[String(def.systemId)] = result.systemConfigId;
      digests.push(result.digest);
    }
  } else {
    console.log("Skipping system creation");
  }

  const result: SetupResult = {
    sender,
    rpcUrl,
    packageId,
    warRegistryId,
    adminCapId,
    warConfigId,
    phaseConfigId,
    systemIds,
    systemConfigIds,
    digests,
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error("Testnet war setup failed.");
  console.error(error);
  process.exit(1);
});
