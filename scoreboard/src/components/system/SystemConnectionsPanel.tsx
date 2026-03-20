import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { stateColor, stateBorderColor, stateLabel } from "../../lib/state-colors";
import { toSvgCoords } from "../../lib/map-layout";

interface ConnectedSystem {
  id: string;
  name: string;
  state: number;
  controller?: number;
}

interface SystemConnectionsPanelProps {
  system: ConnectedSystem;
  neighbors: ConnectedSystem[];
  tribeColorById?: Record<number, string>;
}

const VIEWPORT = { width: 280, height: 200, padding: 40 };
const NODE_RADIUS = 8;

export default function SystemConnectionsPanel({
  system,
  neighbors,
  tribeColorById,
}: SystemConnectionsPanelProps) {
  const navigate = useNavigate();

  // Place selected system at center, neighbors around it in a circle
  const allNodes: (ConnectedSystem & { x: number; y: number })[] = [
    { ...system, x: 0.5, y: 0.5 },
    ...neighbors.map((n, i) => {
      const angle = (i / neighbors.length) * Math.PI * 2 - Math.PI / 2;
      return {
        ...n,
        x: 0.5 + Math.cos(angle) * 0.35,
        y: 0.5 + Math.sin(angle) * 0.35,
      };
    }),
  ];

  const posMap = new Map(
    allNodes.map((n) => [n.id, toSvgCoords(n.x, n.y, VIEWPORT)]),
  );

  return (
    <div>
      <svg
        viewBox={`0 0 ${VIEWPORT.width} ${VIEWPORT.height}`}
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        {/* Edges from center to neighbors */}
        {neighbors.map((n) => {
          const from = posMap.get(system.id);
          const to = posMap.get(n.id);
          if (!from || !to) return null;
          return (
            <line
              key={n.id}
              x1={from.cx}
              y1={from.cy}
              x2={to.cx}
              y2={to.cy}
              stroke="var(--border-edge)"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.5}
            />
          );
        })}

        {/* Nodes */}
        {allNodes.map((node) => {
          const pos = posMap.get(node.id);
          if (!pos) return null;
          const isCurrent = node.id === system.id;
          const color = stateColor(node.state, node.controller, tribeColorById);
          const borderColor = stateBorderColor(node.state, node.controller, tribeColorById);

          return (
            <g
              key={node.id}
              style={{ cursor: isCurrent ? "default" : "pointer" }}
              onClick={() => !isCurrent && navigate(`/system/${node.id}`)}
            >
              <motion.circle
                cx={pos.cx}
                cy={pos.cy}
                r={isCurrent ? NODE_RADIUS + 3 : NODE_RADIUS}
                fill="var(--bg-terminal)"
                stroke={borderColor}
                strokeWidth={isCurrent ? 2 : 1.5}
                whileHover={!isCurrent ? { scale: 1.15 } : {}}
              />
              <circle
                cx={pos.cx}
                cy={pos.cy}
                r={isCurrent ? 5 : 3}
                fill={color}
                opacity={node.state === 0 ? 0.4 : 0.9}
              />
              <text
                x={pos.cx}
                y={pos.cy + (isCurrent ? NODE_RADIUS + 16 : NODE_RADIUS + 13)}
                textAnchor="middle"
                fill={isCurrent ? "var(--mint)" : "var(--text-dim)"}
                fontSize={isCurrent ? 8 : 7}
                fontFamily="IBM Plex Mono"
                letterSpacing="0.06em"
              >
                {node.name.toUpperCase().slice(0, 12)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Neighbor list */}
      <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
        {neighbors.map((n) => (
          <button
            key={n.id}
            onClick={() => navigate(`/system/${n.id}`)}
            style={{
              display: "flex",
              justifyContent: "space-between",
              background: "none",
              border: "none",
              borderBottom: "1px solid var(--border-grid)",
              padding: "0.25rem 0",
              cursor: "pointer",
              fontFamily: "IBM Plex Mono",
              fontSize: "0.65rem",
              color: "var(--text-muted)",
              textAlign: "left",
              width: "100%",
            }}
          >
            <span>{n.name}</span>
            <span style={{ color: stateColor(n.state, n.controller, tribeColorById), fontSize: "0.6rem" }}>
              {stateLabel(n.state)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
