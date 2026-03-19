import type { LogEntry } from "../components/telemetry/LogList";

export const MOCK_WAR_NAME = "Lineage War — Season 1";

export interface TribeScore {
  id: number;
  name: string;
  points: number;
  color: string;
}

export interface SystemControl {
  id: string;
  name: string;
  state: number;
  controller?: number;
  pointsPerTick: number;
  /** Normalized 0..1 position for SVG map */
  x: number;
  y: number;
  /** IDs of connected systems (for map edges) */
  connectedTo: string[];
  /** Optional priority class */
  priority?: "high" | "standard";
}

export interface ScoreAtTick {
  tick: number;
  timestamp: number;
  tribe1: number;
  tribe2: number;
}

export interface PhaseInfo {
  name: string;
  startMs: number;
  endMs: number;
  tick: number;
  totalTicks: number;
}

const now = Date.now();
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Mock time-series: 48 hourly ticks, Tribe A pulls ahead mid-way */
export const MOCK_SCORE_OVER_TIME: ScoreAtTick[] = Array.from({ length: 48 }, (_, i) => {
  const t = i * 10 + 5;
  return {
    tick: i + 1,
    timestamp: now - (48 - i) * HOUR_MS,
    tribe1: Math.min(240, t * 4 + (i >= 20 ? (i - 20) * 3 : 0)),
    tribe2: Math.min(180, t * 3 + (i < 20 ? i * 2 : 0)),
  };
});

export const MOCK_TRIBE_SCORES: TribeScore[] = [
  { id: 1, name: "Tribe Alpha", points: 240, color: "var(--tribe-a)" },
  { id: 2, name: "Tribe Bravo", points: 180, color: "var(--tribe-b)" },
];

export const MOCK_SYSTEMS: SystemControl[] = [
  {
    id: "sys-1",
    name: "Ashfall Depot",
    state: 2,
    controller: 1,
    pointsPerTick: 2,
    x: 0.5,
    y: 0.35,
    connectedTo: ["sys-2", "sys-3", "sys-4"],
    priority: "high",
  },
  {
    id: "sys-2",
    name: "Sable Gate",
    state: 1,
    pointsPerTick: 1,
    x: 0.75,
    y: 0.2,
    connectedTo: ["sys-1", "sys-5"],
    priority: "high",
  },
  {
    id: "sys-3",
    name: "Veritas Station",
    state: 2,
    controller: 2,
    pointsPerTick: 3,
    x: 0.28,
    y: 0.22,
    connectedTo: ["sys-1", "sys-6"],
  },
  {
    id: "sys-4",
    name: "Remnant Hold",
    state: 2,
    controller: 1,
    pointsPerTick: 2,
    x: 0.55,
    y: 0.68,
    connectedTo: ["sys-1", "sys-6"],
  },
  {
    id: "sys-5",
    name: "Hek Passage",
    state: 0,
    pointsPerTick: 1,
    x: 0.88,
    y: 0.52,
    connectedTo: ["sys-2"],
  },
  {
    id: "sys-6",
    name: "Saranen Watch",
    state: 2,
    controller: 2,
    pointsPerTick: 2,
    x: 0.22,
    y: 0.65,
    connectedTo: ["sys-3", "sys-4"],
  },
];

export const MOCK_LAST_TICK_MS = now - 1 * HOUR_MS;

export const MOCK_PHASE: PhaseInfo = {
  name: "Phase II — Escalation",
  startMs: now - 7 * DAY_MS,
  endMs: now + 14 * DAY_MS,
  tick: 48,
  totalTicks: 336, // 14-day phase at hourly ticks
};

export const MOCK_EVENTS: LogEntry[] = [
  {
    id: "evt-1",
    timestamp: now - 1 * HOUR_MS,
    text: "Ashfall Depot — control maintained by Alpha",
    tribe: 1,
    type: "capture",
  },
  {
    id: "evt-2",
    timestamp: now - 1 * HOUR_MS - 300_000,
    text: "Sable Gate — contested, no dominant presence",
    type: "contested",
  },
  {
    id: "evt-3",
    timestamp: now - 2 * HOUR_MS,
    text: "Veritas Station — Bravo holds, +3 pts",
    tribe: 2,
    type: "capture",
  },
  {
    id: "evt-4",
    timestamp: now - 2 * HOUR_MS - 120_000,
    text: "Remnant Hold — Alpha presence confirmed",
    tribe: 1,
    type: "info",
  },
  {
    id: "evt-5",
    timestamp: now - 3 * HOUR_MS,
    text: "Saranen Watch — Bravo control sustained",
    tribe: 2,
    type: "capture",
  },
  {
    id: "evt-6",
    timestamp: now - 4 * HOUR_MS,
    text: "Hek Passage — no presence detected",
    type: "neutral",
  },
  {
    id: "evt-7",
    timestamp: now - 5 * HOUR_MS,
    text: "Sable Gate — contested for 3 consecutive ticks",
    type: "alert",
  },
  {
    id: "evt-8",
    timestamp: now - 6 * HOUR_MS,
    text: "Ashfall Depot — Alpha reinforcement detected",
    tribe: 1,
    type: "info",
  },
  {
    id: "evt-9",
    timestamp: now - 7 * HOUR_MS,
    text: "Veritas Station — Bravo captures from Alpha",
    tribe: 2,
    type: "capture",
  },
  {
    id: "evt-10",
    timestamp: now - 8 * HOUR_MS,
    text: "Global — Phase II escalation begins",
    type: "alert",
  },
];

/** System-filtered events for /system/:id page */
export function mockEventsForSystem(systemId: string): LogEntry[] {
  const name = MOCK_SYSTEMS.find((s) => s.id === systemId)?.name ?? systemId;
  return MOCK_EVENTS.filter((e) => e.text.startsWith(name));
}

/** Get neighboring systems for the connection subgraph */
export function mockNeighbors(systemId: string): SystemControl[] {
  const sys = MOCK_SYSTEMS.find((s) => s.id === systemId);
  if (!sys) return [];
  return MOCK_SYSTEMS.filter((s) => sys.connectedTo.includes(s.id));
}
