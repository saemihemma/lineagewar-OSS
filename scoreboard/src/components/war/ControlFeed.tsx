import LogList, { type LogEntry } from "../telemetry/LogList";
import type { VerifierSnapshot, VerifierTribeScore } from "../../lib/verifier";

interface FeedEvent {
  id: string;
  tickMs: number;
  tickIndex: number;
  systemName: string;
  prevState: string | null;
  prevTribe: VerifierTribeScore | null;
  newState: string;
  tribe: VerifierTribeScore | null;
  pointsAwarded: Array<{ tribeId: number; points: number }>;
  isStateChange: boolean;
}

interface ControlFeedProps {
  snapshots?: VerifierSnapshot[];
  tribeScores: VerifierTribeScore[];
  systemNames: Record<string, string>;
  mockEntries?: LogEntry[];
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function stateToken(
  state: string,
  tribe: VerifierTribeScore | null,
): { label: string; color: string } {
  if (state === "NEUTRAL") return { label: "NEUTRAL", color: "var(--neutral-state)" };
  if (state === "CONTESTED") return { label: "CONTESTED", color: "var(--orange)" };
  const name = tribe ? tribe.name.toUpperCase() : "UNKNOWN";
  return { label: `${name} HELD`, color: tribe?.color ?? "var(--mint)" };
}

function buildFeedEvents(
  snapshots: VerifierSnapshot[],
  tribeById: Map<number, VerifierTribeScore>,
  systemNames: Record<string, string>,
): FeedEvent[] {
  if (snapshots.length === 0) return [];

  const uniqueTicks = [...new Set(snapshots.map((s) => s.tickTimestampMs))].sort((a, b) => a - b);
  const tickIndexByMs = new Map(uniqueTicks.map((ms, i) => [ms, i + 1]));

  const sorted = [...snapshots].sort((a, b) =>
    a.tickTimestampMs !== b.tickTimestampMs
      ? a.tickTimestampMs - b.tickTimestampMs
      : a.systemId - b.systemId,
  );

  const prevBySystem = new Map<number, { state: string; controllerTribeId: number | null }>();
  const events: FeedEvent[] = [];

  for (const snap of sorted) {
    const prev = prevBySystem.get(snap.systemId);
    const systemName = systemNames[String(snap.systemId)] ?? `System ${snap.systemId}`;
    const tickIndex = tickIndexByMs.get(snap.tickTimestampMs) ?? 0;
    const tribe = snap.controllerTribeId !== null ? (tribeById.get(snap.controllerTribeId) ?? null) : null;
    const prevTribe =
      prev?.controllerTribeId !== null && prev?.controllerTribeId !== undefined
        ? (tribeById.get(prev.controllerTribeId) ?? null)
        : null;

    const isStateChange =
      prev !== undefined &&
      (prev.state !== snap.state || prev.controllerTribeId !== snap.controllerTribeId);

    events.push({
      id: `${snap.systemId}-${snap.tickTimestampMs}`,
      tickMs: snap.tickTimestampMs,
      tickIndex,
      systemName,
      prevState: prev?.state ?? null,
      prevTribe,
      newState: snap.state,
      tribe,
      pointsAwarded: snap.pointsAwarded,
      isStateChange,
    });

    prevBySystem.set(snap.systemId, {
      state: snap.state,
      controllerTribeId: snap.controllerTribeId,
    });
  }

  return events.reverse();
}

const FEED_COL = "4ch 5ch minmax(0, 11ch) auto";
const feedCell: React.CSSProperties = { padding: "0.25rem 0" };

function FeedRow({ event }: { event: FeedEvent }) {
  const newToken = stateToken(event.newState, event.tribe);
  const prevToken = event.prevState !== null ? stateToken(event.prevState, event.prevTribe) : null;
  const pts = event.pointsAwarded.reduce((sum, p) => sum + p.points, 0);
  const dim = !event.isStateChange;
  const ptsColor = pts > 0 ? (event.tribe?.color ?? "var(--mint)") : "var(--text-dim)";

  return (
    <div style={{ display: "contents", opacity: dim ? 0.8 : 1 }}>
      {/* Time */}
      <span style={{ ...feedCell, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
        {formatTime(event.tickMs)}
      </span>

      {/* Tick index */}
      <span style={{ ...feedCell, color: "var(--text-muted)" }}>t{String(event.tickIndex).padStart(3, "0")}</span>

      {/* System name */}
      <span
        style={{
          ...feedCell,
          color: "var(--text-muted)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          letterSpacing: "0.04em",
        }}
      >
        {event.systemName.toUpperCase()}
      </span>

      {/* State + Points (merged) */}
      <span style={{ ...feedCell, display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
        {prevToken && event.isStateChange ? (
          <>
            <span style={{ color: prevToken.color, opacity: 0.7, whiteSpace: "nowrap" }}>
              {prevToken.label}
            </span>
            <span style={{ color: "var(--text-muted)" }}>→</span>
            <span style={{ color: newToken.color, whiteSpace: "nowrap" }}>
              {newToken.label}
            </span>
          </>
        ) : (
          <span style={{ color: newToken.color, whiteSpace: "nowrap" }}>{newToken.label}</span>
        )}
        <span style={{ color: ptsColor, whiteSpace: "nowrap" }}>
          {pts > 0 ? `+${pts}` : "—"}
        </span>
      </span>

      {/* Row separator */}
      <span style={{ gridColumn: "1 / -1", borderTop: "1px solid var(--border-grid)", height: 0 }} />
    </div>
  );
}

export default function ControlFeed({
  snapshots,
  tribeScores,
  systemNames,
  mockEntries,
}: ControlFeedProps) {
  // Mock fallback
  if (!snapshots || snapshots.length === 0) {
    if (mockEntries && mockEntries.length > 0) {
      return <LogList entries={mockEntries} maxHeight={320} />;
    }
    return (
      <div
        style={{
          color: "var(--text-dim)",
          fontFamily: "IBM Plex Mono",
          fontSize: "0.65rem",
          padding: "0.5rem 0",
          textAlign: "center",
        }}
      >
        — awaiting verifier tick data —
      </div>
    );
  }

  const tribeById = new Map(tribeScores.map((t) => [t.id, t]));
  const events = buildFeedEvents(snapshots, tribeById, systemNames);

  if (events.length === 0) {
    return (
      <div
        style={{
          color: "var(--text-dim)",
          fontFamily: "IBM Plex Mono",
          fontSize: "0.65rem",
          padding: "0.5rem 0",
          textAlign: "center",
        }}
      >
        — no tick events —
      </div>
    );
  }

  // Group events by tick (events are already newest-first)
  const tickGroups: { tickIndex: number; tickMs: number; events: FeedEvent[] }[] = [];
  for (const event of events) {
    const last = tickGroups[tickGroups.length - 1];
    if (last && last.tickMs === event.tickMs) {
      last.events.push(event);
    } else {
      tickGroups.push({ tickIndex: event.tickIndex, tickMs: event.tickMs, events: [event] });
    }
  }

  return (
    <div
      style={{
        maxHeight: 320,
        overflowY: "auto",
        display: "grid",
        gridTemplateColumns: FEED_COL,
        columnGap: "0.6rem",
        fontFamily: "IBM Plex Mono",
        fontSize: "0.63rem",
        alignItems: "baseline",
      }}
    >
      {tickGroups.map((group) => (
        <div key={group.tickMs} style={{ display: "contents" }}>
          {/* Tick separator — spans all columns */}
          <div
            style={{
              gridColumn: "1 / -1",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5rem 0 0.25rem",
              fontSize: "0.55rem",
              letterSpacing: "0.1em",
              color: "rgba(180, 195, 210, 0.45)",
              borderTop: "1px solid rgba(180, 195, 210, 0.18)",
            }}
          >
            <span style={{ color: "rgba(160, 230, 220, 0.65)", whiteSpace: "nowrap" }}>
              TICK {group.tickIndex}
            </span>
            <span style={{ whiteSpace: "nowrap" }}>
              · {formatTime(group.tickMs)} UTC · {group.events.length} SYSTEM{group.events.length !== 1 ? "S" : ""} LOGGED
            </span>
          </div>
          {group.events.map((event) => (
            <FeedRow key={event.id} event={event} />
          ))}
        </div>
      ))}
    </div>
  );
}
