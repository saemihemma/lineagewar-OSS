import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  OwnerTribeRegistryDocument,
  OwnerTribeRegistryEntry,
  TribeMetadataEntry,
  VerifierConfig,
} from "./types.js";

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function normalizeOwnerEntries(raw: unknown): OwnerTribeRegistryEntry[] {
  if (Array.isArray(raw)) {
    return raw as OwnerTribeRegistryEntry[];
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as OwnerTribeRegistryDocument).owners)) {
    return (raw as OwnerTribeRegistryDocument).owners;
  }
  throw new Error("Owner tribe registry file must be an array or an object with an owners array");
}

function configuredRegistryDocument(config: VerifierConfig): OwnerTribeRegistryDocument | null {
  const configuredPath = config.chain.ownerTribeRegistryPath
    ? path.resolve(process.cwd(), config.chain.ownerTribeRegistryPath)
    : null;

  if (!configuredPath || !existsSync(configuredPath)) {
    return null;
  }

  const raw = readJsonFile<unknown>(configuredPath);
  if (Array.isArray(raw)) {
    return { owners: normalizeOwnerEntries(raw) };
  }
  const parsed = raw as OwnerTribeRegistryDocument;
  return {
    participatingTribeIds: parsed.participatingTribeIds,
    owners: normalizeOwnerEntries(parsed),
  };
}

export class TribeResolver {
  private readonly participatingTribeIds: Set<number>;
  private readonly tribeIdByOwnerCharacterId: Map<string, number>;
  private readonly tribeNameByTribeId: Map<number, string>;

  constructor(config: VerifierConfig) {
    const registry = configuredRegistryDocument(config);
    const configuredTribes =
      config.chain.participatingTribeIds.length > 0
        ? config.chain.participatingTribeIds
        : registry?.participatingTribeIds ?? [];

    this.participatingTribeIds = new Set(configuredTribes);
    this.tribeIdByOwnerCharacterId = new Map();
    for (const entry of registry?.owners ?? []) {
      for (const identity of identitiesForEntry(entry)) {
        this.tribeIdByOwnerCharacterId.set(identity, entry.tribeId);
      }
    }
    this.tribeNameByTribeId = buildTribeNameMap(registry);
  }

  resolveOwnerToTribeId(ownerCharacterId: string | null): number | null {
    if (!ownerCharacterId) {
      return null;
    }
    const tribeId = this.tribeIdByOwnerCharacterId.get(ownerCharacterId) ?? null;
    if (tribeId === null) {
      return null;
    }
    if (this.participatingTribeIds.size > 0 && !this.participatingTribeIds.has(tribeId)) {
      return null;
    }
    return tribeId;
  }

  getParticipatingTribeIds(): number[] {
    return [...this.participatingTribeIds].sort((a, b) => a - b);
  }

  getTribeNameMap(): Record<string, string> {
    return Object.fromEntries(
      [...this.tribeNameByTribeId.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([tribeId, name]) => [String(tribeId), name]),
    );
  }

  async enrichFromWorldApi(worldApiBase: string): Promise<void> {
    const tribeIds = this.getParticipatingTribeIds();
    if (tribeIds.length === 0) return;

    const base = worldApiBase.replace(/\/$/, "");
    const results = await Promise.allSettled(
      tribeIds.map(async (id) => {
        const url = `${base}/v2/tribes/${id}`;
        const response = await globalThis.fetch(url);
        if (!response.ok) return;
        const payload = (await response.json()) as Record<string, unknown>;
        const name = typeof payload.name === "string" ? payload.name.trim() : null;
        if (name) {
          this.tribeNameByTribeId.set(id, name);
        }
      }),
    );
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    console.log(`  TribeResolver: enriched ${succeeded}/${tribeIds.length} tribe names from World API`);
  }
}

function identitiesForEntry(entry: OwnerTribeRegistryEntry): string[] {
  return [
    entry.ownerCharacterId,
    entry.ownerCharacterObjectId,
    entry.ownerCharacterAddress,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
}

function buildTribeNameMap(registry: OwnerTribeRegistryDocument | null): Map<number, string> {
  const result = new Map<number, string>();

  for (const tribe of registry?.tribes ?? ([] satisfies TribeMetadataEntry[])) {
    if (typeof tribe.name === "string" && tribe.name.length > 0) {
      result.set(tribe.tribeId, tribe.name);
    }
  }

  for (const owner of registry?.owners ?? []) {
    if (typeof owner.tribeName === "string" && owner.tribeName.length > 0 && !result.has(owner.tribeId)) {
      result.set(owner.tribeId, owner.tribeName);
    }
  }

  return result;
}
