import type {
  VerifierSnapshot,
  VerifierSystemControl,
  VerifierSystemDisplayConfig,
  VerifierTribeScore,
} from "../../lib/verifier";
import { computeHoldStreaks } from "../../lib/public-war";

interface SystemControlPanelProps {
  systems: VerifierSystemControl[];
  tribeScores: VerifierTribeScore[];
  snapshots?: VerifierSnapshot[];
  systemDisplayConfigs?: VerifierSystemDisplayConfig[];
}

const COL = "auto auto auto auto auto 1fr";

const cellPad: React.CSSProperties = { padding: "0.35rem 0" };
const headerPad: React.CSSProperties = { padding: "0.2rem 0 0.35rem" };

const separator = (color: string): React.CSSProperties => ({
  gridColumn: "1 / -1",
  borderTop: `1px solid ${color}`,
  height: 0,
});

function dotColor(
  state: number,
  controller: number | undefined,
  tribeScores: VerifierTribeScore[],
): string {
  if (state === 1) return "var(--orange)";
  if (state === 2) {
    const tribe = tribeScores.find((t) => t.id === controller);
    return tribe?.color ?? "var(--tribe-a)";
  }
  return "var(--neutral-state)";
}

function stateLabel(
  state: number,
  controller: number | undefined,
  tribeScores: VerifierTribeScore[],
): { text: string; color: string } {
  if (state === 1) return { text: "CONTESTED", color: "var(--orange)" };
  if (state === 2) {
    const tribe = tribeScores.find((t) => t.id === controller);
    const name = tribe ? tribe.name.toUpperCase() : `TRIBE ${controller ?? "?"}`;
    return { text: name, color: tribe?.color ?? "var(--tribe-a)" };
  }
  return { text: "NEUTRAL", color: "var(--neutral-state)" };
}

export default function SystemControlPanel({
  systems,
  tribeScores,
  snapshots = [],
  systemDisplayConfigs = [],
}: SystemControlPanelProps) {
  const holdStreaks = computeHoldStreaks(snapshots);
  const configById = new Map(systemDisplayConfigs.map((c) => [c.systemId, c]));

  if (systems.length === 0) {
    return (
      <div
        style={{
          color: "var(--text-dim)",
          fontFamily: "IBM Plex Mono",
          fontSize: "0.7rem",
          padding: "0.5rem 0",
        }}
      >
        No verifier-backed systems available yet.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: COL,
        columnGap: "10px",
        fontFamily: "IBM Plex Mono",
        fontSize: "0.75rem",
        alignItems: "center",
      }}
    >
      {/* Header row */}
      <div style={{ display: "contents" }}>
        <span style={{ ...headerPad, color: "var(--text-dim)", letterSpacing: "0.05em", fontSize: "0.7rem" }} />
        <span style={{ ...headerPad, color: "var(--text-dim)", letterSpacing: "0.05em", fontSize: "0.7rem" }}>SYSTEM</span>
        <span style={{ ...headerPad, color: "var(--text-dim)", letterSpacing: "0.05em", fontSize: "0.7rem" }}>PTS</span>
        <span style={{ ...headerPad, color: "var(--text-dim)", letterSpacing: "0.05em", fontSize: "0.7rem" }}>CONTROL</span>
        <span style={{ ...headerPad, color: "var(--text-dim)", letterSpacing: "0.05em", fontSize: "0.7rem" }}>STREAK</span>
        <span style={{ ...headerPad, color: "var(--text-dim)", letterSpacing: "0.05em", fontSize: "0.7rem" }}>RULE</span>
      </div>

      {/* Header separator — unbroken line */}
      <span style={separator("var(--border-panel)")} />

      {/* Data rows */}
      {systems.map((system) => {
        const dot = dotColor(system.state, system.controller, tribeScores);
        const label = stateLabel(system.state, system.controller, tribeScores);
        const streak = holdStreaks.get(String(system.id)) ?? 0;
        const config = configById.get(String(system.id));
        const ruleText = config?.publicRuleText?.trim() || "—";

        return (
          <div key={system.id} style={{ display: "contents" }}>
            {/* State dot */}
            <span style={cellPad}>
              <span
                style={{
                  display: "inline-block",
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: dot,
                }}
              />
            </span>

            {/* System name */}
            <span
              style={{
                ...cellPad,
                color: "var(--text-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                letterSpacing: "0.06em",
                maxWidth: "18ch",
              }}
            >
              {system.name.toUpperCase()}
            </span>

            {/* Points per tick */}
            <span
              style={{
                ...cellPad,
                color: system.state === 2 ? label.color : "var(--text-dim)",
                whiteSpace: "nowrap",
              }}
            >
              {system.pointsPerTick > 0 ? String(system.pointsPerTick) : "—"}
            </span>

            {/* Control label */}
            <span
              style={{
                ...cellPad,
                color: label.color,
                letterSpacing: "0.05em",
                whiteSpace: "nowrap",
              }}
            >
              {label.text}
            </span>

            {/* Hold streak */}
            <span
              style={{
                ...cellPad,
                color: streak > 0 ? "var(--text-muted)" : "var(--text-dim)",
                whiteSpace: "nowrap",
              }}
            >
              {streak > 0 ? `×${streak}` : "—"}
            </span>

            {/* Rule label */}
            <span
              style={{
                ...cellPad,
                color: "var(--text-dim)",
                whiteSpace: "normal",
                lineHeight: 1.4,
                letterSpacing: "0.04em",
              }}
            >
              {ruleText}
            </span>

            {/* Row separator — unbroken line */}
            <span style={separator("var(--border-inactive)")} />
          </div>
        );
      })}
    </div>
  );
}
