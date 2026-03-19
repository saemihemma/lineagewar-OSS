import { motion } from "framer-motion";

/**
 * Placeholder for the full galaxy/solar system map.
 * Shows a single contested-state node at center with a slow radial scan sweep.
 * Replace this component with the real data-driven map when stellar cartography data is available.
 */
export default function GalaxyMapPlaceholder() {
  const W = 600;
  const H = 340;
  const cx = W / 2;
  const cy = H / 2;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        aria-label="Galaxy map — data pending"
      >
        {/* Background grid */}
        <defs>
          <pattern id="galaxygrid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path
              d="M 32 0 L 0 0 0 32"
              fill="none"
              stroke="var(--border-grid)"
              strokeWidth="0.4"
            />
          </pattern>

          {/* Radial scan gradient */}
          <radialGradient id="scanGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--mint)" stopOpacity="0" />
            <stop offset="70%" stopColor="var(--mint)" stopOpacity="0" />
            <stop offset="85%" stopColor="var(--mint)" stopOpacity="0.06" />
            <stop offset="100%" stopColor="var(--mint)" stopOpacity="0" />
          </radialGradient>

          {/* Node glow */}
          <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--yellow)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--yellow)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Grid */}
        <rect width={W} height={H} fill="url(#galaxygrid)" opacity="0.5" />

        {/* Outer faint concentric rings */}
        {[80, 140, 200, 260].map((r) => (
          <circle
            key={r}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="var(--border-grid)"
            strokeWidth="0.5"
            opacity="0.4"
          />
        ))}


        {/* Scan sweep fill arc effect (faint wedge) */}
        <motion.ellipse
          cx={cx}
          cy={cy}
          rx={260}
          ry={260}
          fill="url(#scanGrad)"
          style={{ transformOrigin: `${cx}px ${cy}px` }}
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        />

        {/* Node glow halo */}
        <circle cx={cx} cy={cy} r={36} fill="url(#nodeGlow)" />

        {/* Contested pulse ring */}
        <motion.circle
          cx={cx}
          cy={cy}
          r={22}
          fill="none"
          stroke="var(--yellow)"
          strokeWidth="1"
          animate={{ opacity: [0.6, 0.15, 0.6], r: [22, 28, 22] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Main node */}
        <circle
          cx={cx}
          cy={cy}
          r={10}
          fill="var(--bg-terminal)"
          stroke="var(--yellow)"
          strokeWidth="1.5"
        />
        <circle cx={cx} cy={cy} r={4} fill="var(--yellow)" opacity="0.9" />

        {/* Node label */}
        <text
          x={cx}
          y={cy + 24}
          textAnchor="middle"
          fill="var(--yellow-dim)"
          fontSize="8"
          fontFamily="IBM Plex Mono"
          letterSpacing="0.12em"
        >
          ORIGIN NODE
        </text>

        {/* Bottom status text */}
        <text
          x={cx}
          y={H - 10}
          textAnchor="middle"
          fill="var(--text-dim)"
          fontSize="7"
          fontFamily="IBM Plex Mono"
          letterSpacing="0.16em"
        >
          AWAITING STELLAR CARTOGRAPHY DATA
        </text>
      </svg>
    </div>
  );
}
