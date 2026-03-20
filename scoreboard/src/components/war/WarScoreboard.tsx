import { motion } from "framer-motion";
import SegmentedValue from "../telemetry/SegmentedValue";
import type { VerifierSystemControl, VerifierTribeScore } from "../../lib/verifier";

interface WarScoreboardProps {
  tribeScores: VerifierTribeScore[];
  systems?: VerifierSystemControl[];
}

const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

export default function WarScoreboard({ tribeScores, systems = [] }: WarScoreboardProps) {
  if (tribeScores.length < 2) return null;

  const [a, b] = tribeScores.slice(0, 2);
  const delta = a.points - b.points;
  const leader = delta > 0 ? a : delta < 0 ? b : null;
  const tied = delta === 0;

  const systemsForTribe = (id: number) =>
    systems.filter((s) => s.state === 2 && s.controller === id).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Two tribe cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1px",
          background: "var(--border-panel)",
          flex: 1,
        }}
      >
        {[a, b].map((tribe) => {
          const isLeading = leader?.id === tribe.id;
          const color = tribe.color;
          const controlled = systemsForTribe(tribe.id);

          return (
            <motion.div
              key={tribe.id}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              style={{
                background: "var(--bg-panel)",
                borderTop: `2px solid ${color}`,
                padding: "0.85rem 1.25rem 0.75rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {/* Header row: name + status badge */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                }}
              >
                <span
                  style={{
                    fontFamily: "IBM Plex Mono",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color,
                  }}
                >
                  {tribe.name}
                </span>
                {!tied && (
                  <span
                    style={{
                      fontFamily: "IBM Plex Mono",
                      fontSize: "0.7rem",
                      letterSpacing: "0.06em",
                      color: isLeading ? color : "var(--text-dim)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {isLeading ? "▲ LEADING" : "▼ TRAILING"}
                  </span>
                )}
              </div>

              {/* Score number */}
              <SegmentedValue value={tribe.points} color={color} size="xl" />

              {/* Sub-stats */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0 1.5rem",
                  marginTop: "0.25rem",
                  paddingTop: "0.5rem",
                  borderTop: "1px solid var(--border-grid)",
                  fontFamily: "IBM Plex Mono",
                  fontSize: "0.75rem",
                }}
              >
                <div style={{ color: "var(--text-dim)" }}>CTRL PTS</div>
                <div style={{ color, textAlign: "right" }}>{tribe.points}</div>
                <div style={{ color: "var(--text-dim)" }}>SYSTEMS</div>
                <div style={{ color, textAlign: "right" }}>{controlled}</div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
