import StatRow from "../telemetry/StatRow";
import type { VerifierTribeScore } from "../../lib/verifier";
import type { PhaseInfo } from "../../data/mock";

interface PhaseStatusPanelProps {
  lastTickMs: number | null;
  tribeScores: VerifierTribeScore[];
  resolvedTickCount?: number;
  /** Minutes between ticks — omit or pass undefined to hide the field */
  tickRateMinutes?: number;
  /** Mock path: full phase info */
  phase?: PhaseInfo;
  /** Live path: authoritative phase label */
  phaseLabel?: string | null;
  /** Phase start timestamp — required for TIME ELAPSED; show UNKNOWN if absent */
  phaseStartMs?: number;
  /** Phase end timestamp — optional boundary for the active phase */
  phaseEndMs?: number;
  /** Next phase start timestamp — preferred boundary when the next phase is known */
  nextPhaseStartMs?: number;
  warEndMs?: number;
  warLifecycle?: "running" | "ended_pending_resolution" | "resolved";
}

function formatTimestamp(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) {
    return "WAITING";
  }
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
  resolvedTickCount,
  tickRateMinutes,
  phase,
  phaseLabel,
  phaseStartMs,
  phaseEndMs,
  nextPhaseStartMs,
  warEndMs,
  warLifecycle = "running",
}: PhaseStatusPanelProps) {
  const renderedPhaseLabel = phase
    ? formatPhaseLabel(phase)
    : phaseLabel?.trim()
      ? phaseLabel.toUpperCase()
      : "PHASE WAITING";

  const nowMs = Date.now();
  const isEnded = warLifecycle !== "running";
  const elapsedEndMs = isEnded && warEndMs !== undefined ? warEndMs : nowMs;
  const elapsed = phaseStartMs !== undefined ? formatDuration(Math.max(0, elapsedEndMs - phaseStartMs)) : "UNKNOWN";
  const nextBoundaryMs = nextPhaseStartMs ?? phaseEndMs;
  const remaining = isEnded
    ? "WAR ENDED"
    : nextBoundaryMs !== undefined
      ? formatDuration(nextBoundaryMs - nowMs)
      : "WITHHELD";
  const remainingColor = isEnded
    ? "var(--yellow-dim)"
    : remaining === "WITHHELD"
      ? "var(--text-dim)"
      : "var(--text-muted)";

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
        {renderedPhaseLabel}
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
          valueColor={remainingColor}
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
        {resolvedTickCount !== undefined && (
          <StatRow label="TICKS RESOLVED" value={String(resolvedTickCount)} valueColor="var(--text-muted)" />
        )}
      </div>
    </div>
  );
}
