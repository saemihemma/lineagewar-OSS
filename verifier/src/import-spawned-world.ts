import { bcs } from "@mysten/sui/bcs";
import { deriveObjectID } from "@mysten/sui/utils";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AssemblyFamily,
  CandidateAssembly,
  InventoryEntry,
  LiveAssemblyRegistryDocument,
  OwnerTribeRegistryDocument,
} from "./types.js";

type TestResources = {
  locationHash: string;
  character: {
    gameCharacterId: number;
    gameCharacterBId: number;
    gameCharacterCId?: number;
  };
  networkNode: { typeId: number; itemId: number };
  assembly: { typeId: number; itemId: number };
  storageUnit: { typeId: number; itemId: number };
  gate: { typeId: number; itemId1: number; itemId2: number };
  turret?: { typeId: number; itemId: number };
  item: { typeId: number; itemId: number };
};

type ExtractedObjectIds = {
  network: string;
  world: {
    packageId: string;
    objectRegistry: string;
  };
};

type OverlayOwner = {
  ownerCharacterKey?: string;
  ownerCharacterItemId?: number;
  ownerCharacterAddress?: string;
  tribeId: number;
  tribeName?: string;
};

type OverlayAssembly = {
  seedKey?: string;
  itemId?: number;
  objectId?: string;
  ownerCharacterKey?: string;
  ownerCharacterItemId?: number;
  systemId?: number | null;
  bootstrapLocationHashHex?: string | null;
  status?: CandidateAssembly["status"];
  inventory?: InventoryEntry[];
  bootstrapAssemblyFamily?: AssemblyFamily;
  bootstrapAssemblyTypeId?: number | null;
  bootstrapStorageTypeId?: number | null;
};

type SpawnedWorldOverlay = {
  tenant?: string;
  participatingTribeIds?: number[];
  tribes?: Array<{ tribeId: number; name?: string }>;
  owners: OverlayOwner[];
  assemblies: OverlayAssembly[];
};

const TenantItemId = bcs.struct("TenantItemId", {
  id: bcs.u64(),
  tenant: bcs.string(),
});

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function argValue(argv: string[], name: string): string | null {
  const prefix = `${name}=`;
  const match = argv.find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function repoRoot(): string {
  return path.resolve(process.cwd(), "..");
}

function resolveFirstExistingPath(paths: string[]): string {
  for (const candidate of paths) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Could not find any expected file. Checked: ${paths.join(", ")}`);
}

function deriveWorldObjectId(
  registryId: string,
  itemId: number | bigint,
  packageId: string,
  tenant: string,
): string {
  const serializedKey = TenantItemId.serialize({
    id: BigInt(itemId),
    tenant,
  }).toBytes();
  return deriveObjectID(registryId, `${packageId}::in_game_id::TenantItemId`, serializedKey);
}

function characterItemIdFromKey(testResources: TestResources, key: string): number | null {
  switch (key) {
    case "characterA":
      return testResources.character.gameCharacterId;
    case "characterB":
      return testResources.character.gameCharacterBId;
    case "characterC":
      return testResources.character.gameCharacterCId ?? testResources.character.gameCharacterBId + 1;
    default:
      return null;
  }
}

function itemIdFromSeedKey(testResources: TestResources, seedKey: string): number | null {
  switch (seedKey) {
    case "assembly":
      return testResources.assembly.itemId;
    case "storageUnit":
      return testResources.storageUnit.itemId;
    case "gate1":
      return testResources.gate.itemId1;
    case "gate2":
      return testResources.gate.itemId2;
    case "turret":
      return testResources.turret?.itemId ?? null;
    default:
      return null;
  }
}

function resolveCharacterItemId(testResources: TestResources, owner: OverlayOwner | OverlayAssembly): number {
  if (typeof owner.ownerCharacterItemId === "number" && Number.isFinite(owner.ownerCharacterItemId)) {
    return owner.ownerCharacterItemId;
  }
  if (owner.ownerCharacterKey) {
    const resolved = characterItemIdFromKey(testResources, owner.ownerCharacterKey);
    if (resolved !== null) {
      return resolved;
    }
  }
  throw new Error("Owner entry must provide ownerCharacterItemId or a known ownerCharacterKey.");
}

function resolveAssemblyItemId(testResources: TestResources, assembly: OverlayAssembly): number | null {
  if (typeof assembly.itemId === "number" && Number.isFinite(assembly.itemId)) {
    return assembly.itemId;
  }
  if (assembly.seedKey) {
    return itemIdFromSeedKey(testResources, assembly.seedKey);
  }
  return null;
}

function buildOwnerRegistry(
  overlay: SpawnedWorldOverlay,
  testResources: TestResources,
  extracted: ExtractedObjectIds,
  tenant: string,
): OwnerTribeRegistryDocument {
  const owners = overlay.owners.map((entry) => {
    const characterItemId = resolveCharacterItemId(testResources, entry);
    const ownerCharacterId = deriveWorldObjectId(
      extracted.world.objectRegistry,
      characterItemId,
      extracted.world.packageId,
      tenant,
    );
    return {
      ownerCharacterId,
      ownerCharacterAddress: entry.ownerCharacterAddress,
      tribeId: entry.tribeId,
      tribeName: entry.tribeName,
    };
  });

  const participatingTribeIds =
    overlay.participatingTribeIds && overlay.participatingTribeIds.length > 0
      ? [...new Set(overlay.participatingTribeIds)].sort((a, b) => a - b)
      : [...new Set(owners.map((entry) => entry.tribeId))].sort((a, b) => a - b);

  const tribeNamesById = new Map<number, string>();
  for (const tribe of overlay.tribes ?? []) {
    if (tribe.name?.trim()) {
      tribeNamesById.set(tribe.tribeId, tribe.name.trim());
    }
  }
  for (const owner of owners) {
    if (owner.tribeName?.trim() && !tribeNamesById.has(owner.tribeId)) {
      tribeNamesById.set(owner.tribeId, owner.tribeName.trim());
    }
  }

  return {
    participatingTribeIds,
    tribes: participatingTribeIds.map((tribeId) => ({
      tribeId,
      name: tribeNamesById.get(tribeId),
    })),
    owners: owners.map((entry) => ({
      ownerCharacterId: entry.ownerCharacterId,
      ownerCharacterAddress: entry.ownerCharacterAddress,
      tribeId: entry.tribeId,
      tribeName: entry.tribeName,
    })),
  };
}

function buildAssemblyRegistry(
  overlay: SpawnedWorldOverlay,
  testResources: TestResources,
  extracted: ExtractedObjectIds,
  tenant: string,
): LiveAssemblyRegistryDocument {
  return {
    assemblies: overlay.assemblies.map((entry) => {
      const ownerCharacterItemId = resolveCharacterItemId(testResources, entry);
      const bootstrapOwnerCharacterId = deriveWorldObjectId(
        extracted.world.objectRegistry,
        ownerCharacterItemId,
        extracted.world.packageId,
        tenant,
      );
      const resolvedItemId = resolveAssemblyItemId(testResources, entry);
      const objectId =
        entry.objectId ??
        (resolvedItemId !== null
          ? deriveWorldObjectId(
              extracted.world.objectRegistry,
              resolvedItemId,
              extracted.world.packageId,
              tenant,
            )
          : null);

      if (!objectId) {
        throw new Error(
          "Assembly entry must provide objectId or an itemId/seedKey that can be derived into an objectId.",
        );
      }

      if (!entry.seedKey && (entry.bootstrapAssemblyFamily == null || entry.bootstrapAssemblyTypeId == null)) {
        throw new Error(
          `Assembly '${objectId}' does not declare seedKey, so bootstrapAssemblyFamily and bootstrapAssemblyTypeId are required.`,
        );
      }

      return {
        objectId,
        seedKey: entry.seedKey ?? null,
        bootstrapSystemId: entry.systemId ?? null,
        bootstrapLocationHashHex: entry.bootstrapLocationHashHex ?? null,
        bootstrapOwnerCharacterId,
        bootstrapStatus: entry.status ?? "ONLINE",
        bootstrapInventory: entry.inventory ?? [],
        bootstrapAssemblyFamily: entry.bootstrapAssemblyFamily,
        bootstrapAssemblyTypeId: entry.bootstrapAssemblyTypeId ?? null,
        bootstrapStorageTypeId: entry.bootstrapStorageTypeId ?? null,
      };
    }),
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const network = argValue(argv, "--network") ?? "testnet";
  const root = repoRoot();
  const overlayPath =
    argValue(argv, "--overlay") ??
    path.resolve(root, "verifier", "registry", "spawned-world-import.example.json");
  const outputStem = argValue(argv, "--stem") ?? `spawned-${network}`;
  const outputDirectory =
    argValue(argv, "--output-dir") ?? path.resolve(root, "verifier", "registry", "generated");
  const testResourcesPath =
    argValue(argv, "--test-resources") ??
    path.resolve(root, "repos", "world-contracts", "test-resources.json");
  const extractedObjectIdsPath =
    argValue(argv, "--extracted-object-ids") ??
    resolveFirstExistingPath([
      path.resolve(root, "repos", "world-contracts", "deployments", network, "extracted-object-ids.json"),
      path.resolve(root, "repos", "builder-scaffold", "deployments", network, "extracted-object-ids.json"),
    ]);

  const testResources = readJsonFile<TestResources>(testResourcesPath);
  const extracted = readJsonFile<ExtractedObjectIds>(extractedObjectIdsPath);
  const overlay = readJsonFile<SpawnedWorldOverlay>(overlayPath);
  const tenant = overlay.tenant ?? process.env.TENANT ?? "dev";

  const ownerRegistry = buildOwnerRegistry(overlay, testResources, extracted, tenant);
  const assemblyRegistry = buildAssemblyRegistry(overlay, testResources, extracted, tenant);

  await mkdir(outputDirectory, { recursive: true });
  const ownerRegistryPath = path.join(outputDirectory, `${outputStem}-owner-tribes.json`);
  const assemblyRegistryPath = path.join(outputDirectory, `${outputStem}-live-assemblies.json`);
  const summaryPath = path.join(outputDirectory, `${outputStem}-summary.json`);
  const activeSystemIds = [
    ...new Set(
      assemblyRegistry.assemblies
        .map((entry) => entry.bootstrapSystemId ?? entry.fallbackSystemId ?? null)
        .filter((entry): entry is number => entry !== null),
    ),
  ].sort((a, b) => a - b);

  await writeFile(ownerRegistryPath, `${JSON.stringify(ownerRegistry, null, 2)}\n`, "utf8");
  await writeFile(assemblyRegistryPath, `${JSON.stringify(assemblyRegistry, null, 2)}\n`, "utf8");
  await writeFile(
    summaryPath,
    `${JSON.stringify(
      {
        network,
        tenant,
        sourcePaths: {
          overlayPath,
          testResourcesPath,
          extractedObjectIdsPath,
        },
        generatedPaths: {
          assemblyRegistryPath,
          ownerRegistryPath,
        },
        recommendedEnv: {
          LINEAGE_SOURCE: "registry",
          LINEAGE_ASSEMBLY_REGISTRY_PATH: path.relative(path.resolve(root, "verifier"), assemblyRegistryPath),
          LINEAGE_OWNER_TRIBE_REGISTRY_PATH: path.relative(path.resolve(root, "verifier"), ownerRegistryPath),
          LINEAGE_ACTIVE_SYSTEM_IDS: activeSystemIds.join(","),
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`Wrote ${assemblyRegistryPath}`);
  console.log(`Wrote ${ownerRegistryPath}`);
  console.log(`Wrote ${summaryPath}`);
}

main().catch((error: unknown) => {
  console.error("Spawned world import failed.");
  console.error(error);
  process.exit(1);
});
