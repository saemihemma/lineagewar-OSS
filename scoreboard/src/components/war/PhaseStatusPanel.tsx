import StatRow from "../telemetry/StatRow";
import type { VerifierSystemControl, VerifierTribeScore } from "../../lib/verifier";
import type { PhaseInfo } from "../../data/mock";

interface PhaseStatusPanelProps {
  lastTickMs: number;
  systems: VerifierSystemControl[];
  tribeScores: VerifierTribeScore[];
  tickCount?: number;
  /** Minutes between ticks — omit or pass undefined to hide the field */
  tickRateMinutes?: number;
  /** Mock path: full phase info */
  phase?: PhaseInfo;
  /** Phase start timestamp — required for TIME ELAPSED; show UNKNOWN if absent */
  phaseStartMs?: number;
  /** Phase end timestamp — required for TIME TO NEXT PHASE; show UNKNOWN if absent */
  phaseEndMs?: number;
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }) + " UTC";
}

function formatPhaseLabel(phase: PhaseInfo): string {
  const parts = phase.name.split("—");
  if (parts.length >= 2) {
    return `${parts[1].trim().toUpperCase()} // ${parts[0].trim().toUpperCase()}`;
  }
  return phase.name.toUpperCase();
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "0m";
  const totalMinutes = Math.floor(ms / 60000);
  const d = Math.floor(totalMinutes / (60 * 24));
  const h = Math.floor((totalMinutes % (60 * 24)) / 60);
  const m = totalMinutes % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(" ");
}

export default function PhaseStatusPanel({
  lastTickMs,
  tribeScores,
  tickCount,
  tickRateMinutes,
  phase,
  phaseStartMs,
  phaseEndMs,
}: PhaseStatusPanelProps) {
  const phaseLabel = phase ? formatPhaseLabel(phase) : "PHASE 0";

  // Only derive timers from explicit props — never from client session time alone
  const elapsed =
    phaseStartMs !== undefined ? formatDuration(lastTickMs - phaseStartMs) : "UNKNOWN";
  const remaining =
    phaseEndMs !== undefined ? formatDuration(phaseEndMs - Date.now()) : "WITHHELD";

  return (
    <div>
      <div
        style={{
          fontFamily: "IBM Plex Mono",
          fontSize: "0.7rem",
          fontWeight: 500,
          letterSpacing: "0.12em",
          color: "var(--mint)",
          marginBottom: "0.65rem",
        }}
      >
        {phaseLabel}
      </div>
      <div style={{ display: "grid", gap: "0" }}>
        <StatRow label="LAST TICK" value={formatTimestamp(lastTickMs)} valueColor="var(--text-muted)" />
        <StatRow
          label="TIME ELAPSED"
          value={elapsed}
          valueColor={elapsed === "UNKNOWN" ? "var(--text-dim)" : "var(--text-muted)"}
        />
        <StatRow
          label="TIME TO NEXT PHASE"
          value={remaining}
          valueColor={remaining === "WITHHELD" ? "var(--text-dim)" : "var(--text-muted)"}
        />
        {tickRateMinutes !== undefined && (
          <StatRow
            label="TICK RATE"
            value={`${tickRateMinutes % 1 === 0 ? tickRateMinutes : tickRateMinutes.toFixed(1)} MIN`}
            valueColor="var(--text-muted)"
          />
        )}
        {tribeScores.length > 0 && (
          <StatRow
            label="TRIBES"
            value={tribeScores
              .slice(0, 2)
              .map((t) => t.name.toUpperCase())
              .join(" / ")}
            valueColor="var(--text-muted)"
          />
        )}
        {tickCount !== undefined && (
          <StatRow label="TICKS LOGGED" value={String(tickCount)} valueColor="var(--text-muted)" />
        )}
      </div>
    </div>
  );
}
