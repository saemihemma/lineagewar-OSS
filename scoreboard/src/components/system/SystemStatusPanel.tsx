import { motion } from "framer-motion";
import StatRow from "../telemetry/StatRow";
import SectionLabel from "../telemetry/SectionLabel";
import { stateColor, stateLabel } from "../../lib/state-colors";
import type { VerifierTribeScore } from "../../lib/verifier";

interface DisplaySystemStatus {
  id: string;
  name: string;
  state: number;
  controller?: number;
  priority?: "high" | "standard";
}

interface SystemStatusPanelProps {
  system: DisplaySystemStatus;
  tribeScores: VerifierTribeScore[];
  tribeACycles: number;
  tribeBCycles: number;
  neutralCycles: number;
  totalCycles: number;
  tribeColorById?: Record<number, string>;
}

export default function SystemStatusPanel({
  system,
  tribeScores,
  tribeACycles,
  tribeBCycles,
  neutralCycles,
  totalCycles,
  tribeColorById,
}: SystemStatusPanelProps) {
  const color = stateColor(system.state, system.controller, tribeColorById);
  const label = stateLabel(system.state);
  const controllerTribe = tribeScores.find((t) => t.id === system.controller);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
    >
      {/* State badge */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div
          style={{
            fontFamily: "IBM Plex Mono",
            fontSize: "1.1rem",
            fontWeight: 700,
            color,
            letterSpacing: "0.08em",
            textShadow: `0 0 12px ${color}40`,
          }}
        >
          {label}
        </div>
        {controllerTribe && (
          <span
            style={{
              fontFamily: "IBM Plex Mono",
              fontSize: "0.65rem",
              letterSpacing: "0.1em",
              color: "var(--text-dim)",
            }}
          >
            — {controllerTribe.name.toUpperCase()}
          </span>
        )}
      </div>

      <SectionLabel>Control telemetry</SectionLabel>

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <StatRow
          label={tribeScores[0]?.name ?? "TRIBE A"}
          value={`${tribeACycles} ticks`}
          valueColor="var(--mint)"
        />
        <StatRow
          label={tribeScores[1]?.name ?? "TRIBE B"}
          value={`${tribeBCycles} ticks`}
          valueColor="var(--tribe-b)"
        />
        <StatRow
          label="NEUTRAL"
          value={`${neutralCycles} ticks`}
          valueColor="var(--neutral-state)"
        />
        <StatRow label="TOTAL TICKS" value={String(totalCycles)} />
        {system.priority === "high" && (
          <StatRow
            label="PRIORITY"
            value="HIGH VALUE"
            valueColor="var(--yellow)"
          />
        )}
      </div>
    </motion.div>
  );
}
