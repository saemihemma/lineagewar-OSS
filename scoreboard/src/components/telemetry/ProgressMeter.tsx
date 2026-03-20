import { motion } from "framer-motion";

interface ProgressMeterProps {
  value: number;     // 0..1
  color?: string;
  label?: string;
  showPercent?: boolean;
  height?: number;
}

/**
 * Horizontal fill bar for infrastructure status / control percentage.
 */
export default function ProgressMeter({
  value,
  color = "var(--mint)",
  label,
  showPercent = true,
  height = 3,
}: ProgressMeterProps) {
  const pct = Math.min(1, Math.max(0, value));

  return (
    <div style={{ width: "100%" }}>
      {(label || showPercent) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "0.3rem",
            fontFamily: "IBM Plex Mono",
            fontSize: "0.65rem",
          }}
        >
          {label && <span style={{ color: "var(--text-dim)" }}>{label}</span>}
          {showPercent && (
            <span style={{ color, marginLeft: "auto" }}>
              {Math.round(pct * 100)}%
            </span>
          )}
        </div>
      )}
      <div
        style={{
          width: "100%",
          height,
          background: "var(--border-inactive)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{
            height: "100%",
            background: color,
            boxShadow: `0 0 6px ${color}60`,
          }}
        />
      </div>
    </div>
  );
}
