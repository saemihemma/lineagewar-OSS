import { motion } from "framer-motion";
import StatRow from "../telemetry/StatRow";
import ProgressMeter from "../telemetry/ProgressMeter";
import type { PhaseInfo } from "../../data/mock";

interface WarPhasePanelProps {
  phase: PhaseInfo;
  lastTickLabel: string;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysRemaining(endMs: number): number {
  return Math.max(0, Math.ceil((endMs - Date.now()) / (1000 * 60 * 60 * 24)));
}

/** Reformat "Phase II — Escalation" → "ESCALATION // PHASE II" */
function formatPhaseName(name: string): string {
  const parts = name.split(/[—–-]/);
  if (parts.length >= 2) {
    const phaseNum = parts[0].trim().toUpperCase();
    const phaseName = parts[1].trim().toUpperCase();
    return `${phaseName} // ${phaseNum}`;
  }
  return name.toUpperCase();
}

export default function WarPhasePanel({ phase, lastTickLabel }: WarPhasePanelProps) {
  const progress = phase.tick / phase.totalTicks;
  const daysLeft = daysRemaining(phase.endMs);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
    >
      {/* Phase identifier — IBM Plex Mono telemetry style */}
      <div
        style={{
          fontFamily: "IBM Plex Mono",
          fontSize: "0.7rem",
          fontWeight: 600,
          letterSpacing: "0.12em",
          color: "var(--mint)",
        }}
      >
        {formatPhaseName(phase.name)}
      </div>

      <ProgressMeter value={progress} color="var(--mint-dim)" label="PHASE PROGRESS" />

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <StatRow label="TICK" value={`${phase.tick} / ${phase.totalTicks}`} />
        <StatRow label="PHASE END" value={formatDate(phase.endMs)} />
        <StatRow
          label="DAYS REM."
          value={`${daysLeft}d`}
          valueColor={daysLeft < 3 ? "var(--yellow)" : "var(--text)"}
        />
        <StatRow label="LAST TICK" value={lastTickLabel} valueColor="var(--text-muted)" />
      </div>
    </motion.div>
  );
}
