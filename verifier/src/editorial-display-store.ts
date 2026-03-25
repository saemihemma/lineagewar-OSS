import { existsSync, readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadSystemDisplayConfigs } from "./system-display-config.js";
import type { EditorialDisplayEntry, SystemDisplayConfig } from "./types.js";

interface EditorialDisplayDocument {
  version: number;
  entries: EditorialDisplayEntry[];
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalizeSystemId(value: unknown): string {
  const raw = typeof value === "number" ? String(value) : normalizeText(value);
  return raw;
}

function parseOptionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeEntry(entry: unknown): EditorialDisplayEntry | null {
  if (!entry || typeof entry !== "object") return null;
  const raw = entry as Record<string, unknown>;
  const warId = Number(raw.warId);
  const systemId = normalizeSystemId(raw.systemId);
  const effectiveFromMs = Number(raw.effectiveFromMs);
  const updatedAtMs = Number(raw.updatedAtMs);

  if (!Number.isFinite(warId) || warId <= 0 || systemId.length === 0 || !Number.isFinite(effectiveFromMs)) {
    return null;
  }

  const phaseId = parseOptionalNumber(raw.phaseId);
  const displayName = normalizeText(raw.displayName);
  const publicRuleText = normalizeText(raw.publicRuleText);

  return {
    warId,
    phaseId,
    systemId,
    effectiveFromMs,
    updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : Date.now(),
    ...(displayName ? { displayName } : {}),
    publicRuleText,
  };
}

function keyForEntry(entry: Pick<EditorialDisplayEntry, "warId" | "phaseId" | "systemId" | "effectiveFromMs">): string {
  return [entry.warId, entry.phaseId ?? "none", entry.systemId, entry.effectiveFromMs].join(":");
}

function sortEntries(entries: EditorialDisplayEntry[]): EditorialDisplayEntry[] {
  return [...entries].sort((a, b) => {
    if (a.warId !== b.warId) return a.warId - b.warId;
    if (a.effectiveFromMs !== b.effectiveFromMs) return a.effectiveFromMs - b.effectiveFromMs;
    if ((a.phaseId ?? -1) !== (b.phaseId ?? -1)) return (a.phaseId ?? -1) - (b.phaseId ?? -1);
    if (a.systemId !== b.systemId) return a.systemId.localeCompare(b.systemId);
    return a.updatedAtMs - b.updatedAtMs;
  });
}

function sortEntriesForWar(entries: EditorialDisplayEntry[]): EditorialDisplayEntry[] {
  return [...entries].sort((a, b) => {
    if (a.effectiveFromMs !== b.effectiveFromMs) return a.effectiveFromMs - b.effectiveFromMs;
    if (a.updatedAtMs !== b.updatedAtMs) return a.updatedAtMs - b.updatedAtMs;
    if ((a.phaseId ?? -1) !== (b.phaseId ?? -1)) return (a.phaseId ?? -1) - (b.phaseId ?? -1);
    return a.systemId.localeCompare(b.systemId);
  });
}

async function atomicWriteJson(targetPath: string, value: unknown): Promise<void> {
  const tmpPath = `${targetPath}.tmp`;
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmpPath, targetPath);
}

function buildLegacyMap(legacyConfigs: SystemDisplayConfig[]): Map<string, SystemDisplayConfig> {
  return new Map(
    legacyConfigs.map((config) => [
      String(config.systemId),
      {
        systemId: String(config.systemId),
        ...(normalizeText(config.displayName) ? { displayName: normalizeText(config.displayName) } : {}),
        publicRuleText: normalizeText(config.publicRuleText),
      },
    ]),
  );
}

function pickApplicableEntry(
  entries: EditorialDisplayEntry[],
  warId: number,
  systemId: string,
  atMs: number,
  phaseId: number | null,
): EditorialDisplayEntry | null {
  const candidates = entries
    .filter((entry) => entry.warId === warId && entry.systemId === systemId && entry.effectiveFromMs <= atMs)
    .sort((a, b) => {
      if (a.effectiveFromMs !== b.effectiveFromMs) return b.effectiveFromMs - a.effectiveFromMs;
      return b.updatedAtMs - a.updatedAtMs;
    });

  if (candidates.length === 0) return null;
  if (phaseId != null) {
    const phaseMatch = candidates.find((entry) => entry.phaseId === phaseId);
    if (phaseMatch) return phaseMatch;
  }
  return candidates[0];
}

function mergeRuntimeAndLegacy(
  runtimeEntry: EditorialDisplayEntry | null,
  legacyEntry: SystemDisplayConfig | null,
  systemId: string,
): SystemDisplayConfig | null {
  if (!runtimeEntry && !legacyEntry) return null;
  const displayName = runtimeEntry?.displayName || legacyEntry?.displayName || "";
  const publicRuleText = runtimeEntry ? runtimeEntry.publicRuleText : legacyEntry?.publicRuleText ?? "";
  return {
    systemId,
    ...(displayName ? { displayName } : {}),
    publicRuleText,
  };
}

export function defaultEditorialDisplayPath(outputPath: string): string {
  return path.join(path.dirname(outputPath), "editorial-display.json");
}

export function readEditorialDisplayEntries(editorialDisplayPath: string | null): EditorialDisplayEntry[] {
  if (!editorialDisplayPath) return [];
  const absolutePath = path.resolve(process.cwd(), editorialDisplayPath);
  if (!existsSync(absolutePath)) return [];

  try {
    const parsed = JSON.parse(readFileSync(absolutePath, "utf8")) as EditorialDisplayDocument | EditorialDisplayEntry[];
    const entries = Array.isArray(parsed) ? parsed : parsed.entries ?? [];
    return sortEntries(entries.map(normalizeEntry).filter((entry): entry is EditorialDisplayEntry => entry !== null));
  } catch {
    return [];
  }
}

export function readEditorialDisplayEntriesForWar(
  editorialDisplayPath: string | null,
  warId: number,
): EditorialDisplayEntry[] {
  if (!Number.isFinite(warId) || warId <= 0) return [];
  return sortEntriesForWar(
    readEditorialDisplayEntries(editorialDisplayPath).filter((entry) => entry.warId === warId),
  );
}

export async function upsertEditorialDisplayEntries(
  editorialDisplayPath: string,
  entries: EditorialDisplayEntry[],
): Promise<EditorialDisplayEntry[]> {
  const absolutePath = path.resolve(process.cwd(), editorialDisplayPath);
  const existing = readEditorialDisplayEntries(absolutePath);
  const merged = new Map(existing.map((entry) => [keyForEntry(entry), entry]));

  for (const entry of entries) {
    const normalized = normalizeEntry(entry);
    if (!normalized) continue;
    merged.set(keyForEntry(normalized), normalized);
  }

  const nextEntries = sortEntries([...merged.values()]);
  await atomicWriteJson(absolutePath, {
    version: 1,
    entries: nextEntries,
  } satisfies EditorialDisplayDocument);
  return nextEntries;
}

export function resolveCurrentSystemDisplayConfigs(options: {
  entries: EditorialDisplayEntry[];
  legacyConfigs?: SystemDisplayConfig[];
  warId: number;
  atMs: number;
  phaseId?: number | null;
  systemIds?: Array<string | number>;
}): SystemDisplayConfig[] {
  const {
    entries,
    legacyConfigs = [],
    warId,
    atMs,
    phaseId = null,
    systemIds = [],
  } = options;
  const legacyBySystemId = buildLegacyMap(legacyConfigs);
  const resolvedIds = systemIds.length > 0
    ? [...new Set(systemIds.map((systemId) => String(systemId)))]
    : [...new Set([
        ...entries.filter((entry) => entry.warId === warId).map((entry) => entry.systemId),
        ...legacyConfigs.map((entry) => String(entry.systemId)),
      ])];

  return resolvedIds
    .map((systemId) =>
      mergeRuntimeAndLegacy(
        pickApplicableEntry(entries, warId, systemId, atMs, phaseId),
        legacyBySystemId.get(systemId) ?? null,
        systemId,
      ),
    )
    .filter((entry): entry is SystemDisplayConfig => entry !== null)
    .sort((a, b) => Number(a.systemId) - Number(b.systemId));
}

export function resolveEditorialDisplayForTick(options: {
  entries: EditorialDisplayEntry[];
  legacyConfigs?: SystemDisplayConfig[];
  warId: number;
  phaseId?: number | null;
  systemId: string | number;
  tickTimestampMs: number;
}): SystemDisplayConfig | null {
  const { entries, legacyConfigs = [], warId, phaseId = null, systemId, tickTimestampMs } = options;
  const normalizedSystemId = String(systemId);
  const legacyBySystemId = buildLegacyMap(legacyConfigs);
  return mergeRuntimeAndLegacy(
    pickApplicableEntry(entries, warId, normalizedSystemId, tickTimestampMs, phaseId),
    legacyBySystemId.get(normalizedSystemId) ?? null,
    normalizedSystemId,
  );
}

export function loadResolvedSystemDisplayConfigs(options: {
  systemDisplayConfigPath: string | null;
  systemNamesPath?: string | null;
  editorialDisplayPath: string | null;
  warId: number;
  atMs: number;
  phaseId?: number | null;
  systemIds?: Array<string | number>;
}): {
  editorialDisplayEntries: EditorialDisplayEntry[];
  systemDisplayConfigs: SystemDisplayConfig[];
} {
  const {
    systemDisplayConfigPath,
    systemNamesPath = null,
    editorialDisplayPath,
    warId,
    atMs,
    phaseId = null,
    systemIds = [],
  } = options;
  const legacySystemDisplayConfigs = loadSystemDisplayConfigs(systemDisplayConfigPath, systemNamesPath);
  const editorialDisplayEntries = readEditorialDisplayEntries(editorialDisplayPath);
  const systemDisplayConfigs = resolveCurrentSystemDisplayConfigs({
    entries: editorialDisplayEntries,
    legacyConfigs: legacySystemDisplayConfigs,
    warId,
    atMs,
    phaseId,
    systemIds,
  });

  return {
    editorialDisplayEntries,
    systemDisplayConfigs,
  };
}
