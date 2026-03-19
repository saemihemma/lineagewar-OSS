import type { LogEntry } from "../components/telemetry/LogList";
import type { VerifierScoreboardPayload, VerifierSnapshot, VerifierSystemControl, VerifierTribeScore } from "./verifier";

export interface DisplaySystemControl extends VerifierSystemControl {
  x: number;
  y: number;
  connectedTo: string[];
  priority?: "high" | "standard";
}

export interface HeaderMetaItem {
  label: string;
  value: string;
}

export function formatSource(raw: string | undefined): string {
  if (!raw) return "VERIFIER";
  return raw.replace(/-/g, " ").toUpperCase();
}

export function formatUtcTimestamp(
  timestampMs: number | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (timestampMs === null || timestampMs === undefined || !Number.isFinite(timestampMs)) {
    return "WAITING";
  }

  const formatterOptions: Intl.DateTimeFormatOptions = options ?? {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };

  return (
    new Date(timestampMs).toLocaleString(undefined, {
      timeZone: "UTC",
      ...formatterOptions,
    }) + " UTC"
  );
}

export function fallbackTribeName(tribeId: number | null | undefined): string {
  return tribeId === null || tribeId === undefined ? "Unknown tribe" : `Tribe ${tribeId}`;
}

export function buildTribeColorById(tribes: VerifierTribeScore[]): Record<number, string> {
  return Object.fromEntries(tribes.map((tribe) => [tribe.id, tribe.color]));
}

export function projectSystemsForDisplay(systems: VerifierSystemControl[]): DisplaySystemControl[] {
  const total = Math.max(1, systems.length);

  return systems.map((system, index) => {
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
    const ringRadius = total <= 3 ? 0.22 : 0.32 + (index % 2) * 0.08;

    return {
      ...system,
      x: 0.5 + Math.cos(angle) * ringRadius,
      y: 0.5 + Math.sin(angle) * ringRadius,
      connectedTo: [],
      priority: index < 2 ? "high" : "standard",
    };
  });
}

export function buildHeaderMeta(
  systems: VerifierSystemControl[],
  chartData: Array<{ tick: number }>,
  modeLabel: string,
): HeaderMetaItem[] {
  const activeSystemCount = systems.filter((system) => system.state !== 0).length;
  const latestTick = chartData.at(-1)?.tick ?? 0;

  return [
    { label: "SOURCE", value: modeLabel },
    { label: "TICK", value: latestTick > 0 ? String(latestTick) : "WAITING" },
    { label: "SYSTEMS", value: `${activeSystemCount} ACTIVE` },
  ];
}

function summarizeSystem(
  system: VerifierSystemControl,
  tribeNameById: Record<number, string>,
): { text: string; tribe?: number; type: LogEntry["type"] } {
  if (system.state === 2 && system.controller !== undefined) {
    return {
      text: `${system.name} — ${tribeNameById[system.controller] ?? fallbackTribeName(system.controller)} controls the system`,
      tribe: system.controller,
      type: "capture",
    };
  }

  if (system.state === 1) {
    return {
      text: `${system.name} — contested at the latest verifier tick`,
      type: "contested",
    };
  }

  return {
    text: `${system.name} — neutral at the latest verifier tick`,
    type: "neutral",
  };
}

export function buildCurrentControlFeed(payload: VerifierScoreboardPayload): LogEntry[] {
  const tribeNameById = Object.fromEntries(payload.tribeScores.map((tribe) => [tribe.id, tribe.name]));

  return payload.systems.map((system) => {
    const summary = summarizeSystem(system, tribeNameById);

    return {
      id: `${system.id}-${payload.lastTickMs}`,
      timestamp: payload.lastTickMs,
      text: summary.text,
      tribe: summary.tribe,
      type: summary.type,
      color:
        summary.tribe !== undefined
          ? payload.tribeScores.find((tribe) => tribe.id === summary.tribe)?.color
          : undefined,
    };
  });
}

/** Count consecutive ticks each system has been held by the same tribe (from most recent tick). */
export function computeHoldStreaks(snapshots: VerifierSnapshot[]): Map<string, number> {
  const bySystem = new Map<string, VerifierSnapshot[]>();
  for (const snap of snapshots) {
    const key = String(snap.systemId);
    const arr = bySystem.get(key) ?? [];
    arr.push(snap);
    bySystem.set(key, arr);
  }

  const streaks = new Map<string, number>();
  for (const [key, snaps] of bySystem) {
    const sorted = [...snaps].sort((a, b) => a.tickTimestampMs - b.tickTimestampMs);
    const lastController = sorted[sorted.length - 1]?.controllerTribeId ?? null;
    if (lastController === null) {
      streaks.set(key, 0);
      continue;
    }
    let streak = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].controllerTribeId === lastController) {
        streak++;
      } else {
        break;
      }
    }
    streaks.set(key, streak);
  }
  return streaks;
}

/** Build a systemId → name lookup from the systems list. */
export function buildSystemNameMap(systems: VerifierSystemControl[]): Record<string, string> {
  return Object.fromEntries(systems.map((s) => [String(s.id), s.name]));
}

export function isScoreboardPayloadUsable(
  payload: VerifierScoreboardPayload | undefined,
): payload is VerifierScoreboardPayload {
  return Boolean(payload && payload.tribeScores.length > 0);
}
