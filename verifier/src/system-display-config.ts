import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { SystemDisplayConfig } from "./types.js";

type RawDocument =
  | SystemDisplayConfig[]
  | {
      systems?: SystemDisplayConfig[];
    };

type RawSystemNamesDocument =
  | {
      systems?: Array<{
        systemId: number | string;
        displayName?: string;
        systemName?: string;
      }>;
    }
  | Array<{
      systemId: number | string;
      displayName?: string;
      systemName?: string;
    }>;

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function loadSystemDisplayConfigEntries(configPath: string | null): SystemDisplayConfig[] {
  if (!configPath) return [];
  const absolutePath = path.resolve(process.cwd(), configPath);
  if (!existsSync(absolutePath)) return [];
  const raw = JSON.parse(readFileSync(absolutePath, "utf8")) as RawDocument;
  const entries = Array.isArray(raw) ? raw : raw.systems ?? [];
  return entries
    .map((entry) => {
      const displayName = normalizeText((entry as { displayName?: unknown }).displayName);
      const publicRuleText =
        normalizeText((entry as { publicRuleText?: unknown }).publicRuleText) ||
        normalizeText((entry as { displayRuleDescription?: unknown }).displayRuleDescription);

      return {
        systemId: normalizeText(entry.systemId),
        displayName,
        publicRuleText,
      };
    })
    .filter((entry) => entry.systemId.length > 0);
}

function loadSystemNameEntries(systemNamesPath: string | null): Map<string, string> {
  if (!systemNamesPath) return new Map();
  const absolutePath = path.resolve(process.cwd(), systemNamesPath);
  if (!existsSync(absolutePath)) return new Map();
  const raw = JSON.parse(readFileSync(absolutePath, "utf8")) as RawSystemNamesDocument;
  const entries = Array.isArray(raw) ? raw : raw.systems ?? [];
  const map = new Map<string, string>();
  for (const entry of entries) {
    const systemId = normalizeText(String(entry.systemId ?? ""));
    const name = normalizeText(entry.displayName ?? entry.systemName);
    if (systemId && name) {
      map.set(systemId, name);
    }
  }
  return map;
}

export function loadSystemDisplayConfigs(
  configPath: string | null,
  systemNamesPath: string | null = null,
): SystemDisplayConfig[] {
  const displayEntries = loadSystemDisplayConfigEntries(configPath);
  const nameBySystemId = loadSystemNameEntries(systemNamesPath);

  if (nameBySystemId.size === 0) {
    return displayEntries;
  }

  const merged = new Map<string, SystemDisplayConfig>();
  for (const entry of displayEntries) {
    merged.set(entry.systemId, entry);
  }
  for (const [systemId, systemName] of nameBySystemId.entries()) {
    const existing = merged.get(systemId);
    if (existing) {
      merged.set(systemId, {
        ...existing,
        displayName: existing.displayName || systemName,
      });
    } else {
      merged.set(systemId, {
        systemId,
        displayName: systemName,
        publicRuleText: "",
      });
    }
  }

  return [...merged.values()];
}
