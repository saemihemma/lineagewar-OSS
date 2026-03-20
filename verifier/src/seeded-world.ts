import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { SeededWorldResources, VerifierScenario } from "./types.js";

type TestResources = {
  locationHash: string;
  character: {
    gameCharacterId: number;
    gameCharacterBId: number;
    gameCharacterCId?: number;
  };
  assembly: { typeId: number; itemId: number };
  storageUnit: { typeId: number; itemId: number };
  gate: { typeId: number; itemId1: number; itemId2: number };
  turret?: { typeId: number; itemId: number };
  item: { typeId: number; itemId: number };
};

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function stableObjectId(seed: string): string {
  return `0x${createHash("sha256").update(seed).digest("hex").slice(0, 64)}`;
}

function buildRepeatedSeeds(
  prefix: string,
  count: number,
  seed: {
    assemblyFamily: SeededWorldResources["assemblySeeds"][string]["assemblyFamily"];
    assemblyTypeId: number;
    storageTypeId: number | null;
    itemIdBase: number;
  },
): SeededWorldResources["assemblySeeds"] {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `${prefix}${index + 1}`,
      {
        assemblyFamily: seed.assemblyFamily,
        assemblyTypeId: seed.assemblyTypeId,
        storageTypeId: seed.storageTypeId,
        itemId: seed.itemIdBase + index,
      },
    ]),
  );
}

function tryReadObjectIds(repoRoot: string): Partial<Record<string, string>> {
  const candidatePaths = [
    path.resolve(repoRoot, "repos/world-contracts/deployments/localnet/extracted-object-ids.json"),
    path.resolve(repoRoot, "repos/world-contracts/deployments/testnet/extracted-object-ids.json"),
    path.resolve(repoRoot, "repos/builder-scaffold/deployments/localnet/extracted-object-ids.json"),
    path.resolve(repoRoot, "repos/builder-scaffold/deployments/testnet/extracted-object-ids.json"),
  ];

  for (const candidatePath of candidatePaths) {
    if (!existsSync(candidatePath)) {
      continue;
    }

    const parsed = readJsonFile<Record<string, unknown>>(candidatePath);
    const objectIds: Partial<Record<string, string>> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.startsWith("0x")) {
        objectIds[key] = value;
      }
    }
    return objectIds;
  }

  return {};
}

export function loadSeededWorldResources(repoRoot = path.resolve(process.cwd(), "..")): SeededWorldResources {
  const testResourcesPath = path.resolve(repoRoot, "repos/world-contracts/test-resources.json");
  if (!existsSync(testResourcesPath)) {
    return {
      locationHash: "",
      characterIds: {},
      assemblySeeds: {},
      itemTypeIds: {},
      objectIds: {},
    };
  }
  const testResources = readJsonFile<TestResources>(testResourcesPath);
  const objectIds = tryReadObjectIds(repoRoot);
  const storageUnitSeeds = buildRepeatedSeeds("storageUnit", 12, {
    assemblyFamily: "smart_storage_unit",
    assemblyTypeId: testResources.storageUnit.typeId,
    storageTypeId: testResources.storageUnit.typeId,
    itemIdBase: testResources.storageUnit.itemId,
  });
  const gateSeeds = buildRepeatedSeeds("gate", 8, {
    assemblyFamily: "smart_gate",
    assemblyTypeId: testResources.gate.typeId,
    storageTypeId: null,
    itemIdBase: testResources.gate.itemId1,
  });

  return {
    locationHash: testResources.locationHash,
    characterIds: {
      characterA: testResources.character.gameCharacterId,
      characterB: testResources.character.gameCharacterBId,
      characterC: testResources.character.gameCharacterCId ?? testResources.character.gameCharacterBId + 1,
    },
    assemblySeeds: {
      assembly: {
        assemblyFamily: "other",
        assemblyTypeId: testResources.assembly.typeId,
        storageTypeId: null,
        itemId: testResources.assembly.itemId,
      },
      storageUnit: {
        assemblyFamily: "smart_storage_unit",
        assemblyTypeId: testResources.storageUnit.typeId,
        storageTypeId: testResources.storageUnit.typeId,
        itemId: testResources.storageUnit.itemId,
      },
      storageUnitA: {
        assemblyFamily: "smart_storage_unit",
        assemblyTypeId: testResources.storageUnit.typeId,
        storageTypeId: testResources.storageUnit.typeId,
        itemId: testResources.storageUnit.itemId,
      },
      storageUnitB: {
        assemblyFamily: "smart_storage_unit",
        assemblyTypeId: testResources.storageUnit.typeId,
        storageTypeId: testResources.storageUnit.typeId,
        itemId: testResources.storageUnit.itemId + 1,
      },
      ...storageUnitSeeds,
      gate1: {
        assemblyFamily: "smart_gate",
        assemblyTypeId: testResources.gate.typeId,
        storageTypeId: null,
        itemId: testResources.gate.itemId1,
      },
      gate2: {
        assemblyFamily: "smart_gate",
        assemblyTypeId: testResources.gate.typeId,
        storageTypeId: null,
        itemId: testResources.gate.itemId2,
      },
      ...gateSeeds,
      turret: {
        assemblyFamily: "smart_turret",
        assemblyTypeId: testResources.turret?.typeId ?? testResources.gate.typeId,
        storageTypeId: null,
        itemId: testResources.turret?.itemId ?? testResources.gate.itemId2 + 1000,
      },
    },
    itemTypeIds: {
      seedItem: testResources.item.typeId,
    },
    objectIds,
  };
}

export function loadVerifierScenario(
  scenarioName: string,
  repoRoot = path.resolve(process.cwd(), ".."),
): VerifierScenario {
  const scenarioPath = path.resolve(repoRoot, "verifier", "scenarios", `${scenarioName}.json`);
  return readJsonFile<VerifierScenario>(scenarioPath);
}

export function buildSeededAssemblyId(
  seedKey: string,
  itemId: number,
  objectIds: Partial<Record<string, string>>,
): string {
  return objectIds[seedKey] || stableObjectId(`seeded-assembly:${seedKey}:${itemId}`);
}

export function buildSeededCharacterId(characterKey: string, characterId: number): string {
  return stableObjectId(`seeded-character:${characterKey}:${characterId}`);
}
