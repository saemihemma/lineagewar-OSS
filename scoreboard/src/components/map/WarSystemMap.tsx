import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { stateColor, stateBorderColor } from "../../lib/state-colors";
import { toSvgCoords, buildEdges } from "../../lib/map-layout";
import MapLegend from "./MapLegend";

interface MapSystemControl {
  id: string;
  name: string;
  state: number;
  controller?: number;
  x: number;
  y: number;
  connectedTo?: string[];
  priority?: "high" | "standard";
}

interface WarSystemMapProps {
  systems: MapSystemControl[];
  selectedSystemId?: string;
  onSelectSystem?: (id: string) => void;
  tribeLegend?: Array<{ color: string; label: string }>;
  tribeColorById?: Record<number, string>;
}

const VIEWPORT = { width: 600, height: 380, padding: 48 };
const NODE_RADIUS = 10;

export default function WarSystemMap({
  systems,
  selectedSystemId,
  onSelectSystem,
  tribeLegend,
  tribeColorById,
}: WarSystemMapProps) {
  const navigate = useNavigate();
  const systemsWithConnections = systems.map((system) => ({
    ...system,
    connectedTo: system.connectedTo ?? [],
  }));
  const edges = buildEdges(systemsWithConnections);

  // Build position lookup
  const posMap = new Map(
    systemsWithConnections.map((s) => [s.id, toSvgCoords(s.x, s.y, VIEWPORT)]),
  );

  function handleSelect(id: string) {
    if (onSelectSystem) onSelectSystem(id);
    navigate(`/system/${id}`);
  }

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${VIEWPORT.width} ${VIEWPORT.height}`}
        style={{
          width: "100%",
          height: "auto",
          display: "block",
          overflow: "visible",
        }}
        aria-label="War system map"
      >
        {/* Background grid lines */}
        <defs>
          <pattern id="mapgrid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path
              d="M 32 0 L 0 0 0 32"
              fill="none"
              stroke="var(--border-grid)"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#mapgrid)" opacity="0.6" />

        {/* Edges */}
        {edges.map((edge) => {
          const from = posMap.get(edge.from);
          const to = posMap.get(edge.to);
          if (!from || !to) return null;
          const fromSys = systemsWithConnections.find((s) => s.id === edge.from);
          const toSys = systemsWithConnections.find((s) => s.id === edge.to);
          const isActive =
            (fromSys?.state === 2 || toSys?.state === 2) &&
            fromSys?.controller === toSys?.controller;

          return (
            <motion.line
              key={edge.key}
              x1={from.cx}
              y1={from.cy}
              x2={to.cx}
              y2={to.cy}
              stroke={isActive ? "var(--border-edge)" : "var(--border-inactive)"}
              strokeWidth={isActive ? 1.5 : 1}
              strokeDasharray={isActive ? undefined : "4 4"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            />
          );
        })}

        {/* Nodes */}
        {systemsWithConnections.map((sys) => {
          const pos = posMap.get(sys.id);
          if (!pos) return null;
          const color = stateColor(sys.state, sys.controller, tribeColorById);
          const borderColor = stateBorderColor(sys.state, sys.controller, tribeColorById);
          const isSelected = sys.id === selectedSystemId;
          const isHigh = sys.priority === "high";

          return (
            <g
              key={sys.id}
              style={{ cursor: "pointer" }}
              onClick={() => handleSelect(sys.id)}
              role="button"
              aria-label={`${sys.name}: ${sys.state === 2 ? "controlled" : sys.state === 1 ? "contested" : "neutral"}`}
            >
              {/* Outer ring for selected */}
              {isSelected && (
                <circle
                  cx={pos.cx}
                  cy={pos.cy}
                  r={NODE_RADIUS + 6}
                  fill="none"
                  stroke={borderColor}
                  strokeWidth={1}
                  opacity={0.5}
                />
              )}

              {/* Glow for contested */}
              {sys.state === 1 && (
                <motion.circle
                  cx={pos.cx}
                  cy={pos.cy}
                  r={NODE_RADIUS + 8}
                  fill="none"
                  stroke="var(--yellow)"
                  strokeWidth={1}
                  animate={{ opacity: [0.6, 0.1, 0.6] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />
              )}

              {/* Main node */}
              <motion.circle
                cx={pos.cx}
                cy={pos.cy}
                r={isHigh ? NODE_RADIUS + 2 : NODE_RADIUS}
                fill="var(--bg-terminal)"
                stroke={borderColor}
                strokeWidth={isSelected ? 2 : 1.5}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.35, delay: 0.1 }}
                whileHover={{ scale: 1.15 }}
              />

              {/* Inner fill dot */}
              <circle
                cx={pos.cx}
                cy={pos.cy}
                r={isHigh ? 4 : 3}
                fill={color}
                opacity={sys.state === 0 ? 0.4 : 0.9}
              />

              {/* System label */}
              <text
                x={pos.cx}
                y={pos.cy + NODE_RADIUS + 14}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize="8"
                fontFamily="IBM Plex Mono"
                letterSpacing="0.08em"
              >
                {sys.name.toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>

      <MapLegend tribes={tribeLegend} />
    </div>
  );
}
