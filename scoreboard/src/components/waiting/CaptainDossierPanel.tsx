import type { TribeCommand } from "../../lib/war-phases";
import { useIntermittentScramble } from "../../hooks/useIntermittentScramble";

const PANEL_FONT: React.CSSProperties = { fontFamily: "IBM Plex Mono" };

type PanelState = "resolved" | "partial" | "pending";

function derivePanelState(tribe: TribeCommand | null): PanelState {
  if (!tribe) return "pending";
  if (tribe.name && tribe.id) return "resolved";
  if (tribe.captainName) return "partial";
  return "pending";
}

export default function CaptainDossierPanel({
  tribe,
  side,
}: {
  tribe: TribeCommand | null;
  side: "a" | "b";
}) {
  const scrambleIdentity = useIntermittentScramble(10);
  const scrambleTribe = useIntermittentScramble(9);
  const scrambleId = useIntermittentScramble(8);
  const state = derivePanelState(tribe);
  const isResolved = state === "resolved";
  const tribeColor = side === "a" ? "var(--tribe-a)" : "var(--tribe-b)";

  // Visual treatment by state
  const borderColor = isResolved ? tribeColor : "var(--border-panel)";
  const titleColor = isResolved ? tribeColor : "var(--text-dim)";
  const titleBg = isResolved ? `${tribeColor}08` : "transparent";
  const valueColor = isResolved ? "var(--mint)" : "var(--text-dim)";

  // Title bar tribe name
  const titleTribeName = isResolved ? (tribe?.name ?? "UNRESOLVED") : "UNRESOLVED";
  const showScanlines = !isResolved;

  // IDENTITY — bright in resolved + partial, scrambled in pending
  const identity = state === "pending"
    ? scrambleIdentity
    : (tribe?.captainName ?? "WITHHELD");
  const identityColor = state === "pending" ? "var(--text-dim)" : "var(--mint)";

  // TRIBE — actual name if resolved, "UNRESOLVED" if partial, scrambled if pending
  const tribeDisplay = isResolved
    ? (tribe?.name ?? "UNRESOLVED")
    : state === "partial"
      ? "UNRESOLVED"
      : scrambleTribe;
  const tribeDisplayColor = isResolved ? "var(--mint)" : "var(--text-dim)";

  // TRIBE ID — actual value if resolved, "WITHHELD" if partial, scrambled if pending
  const tribeIdDisplay = isResolved
    ? (tribe?.id ?? "WITHHELD")
    : state === "partial"
      ? "WITHHELD"
      : scrambleId;
  const tribeIdColor = isResolved ? "var(--mint)" : "var(--text-dim)";

  const statusText = isResolved ? "COMMAND LINK ESTABLISHED" : "COMMAND LINK PENDING";

  const fieldLabel: React.CSSProperties = {
    ...PANEL_FONT,
    fontSize: "0.6rem",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--text-dim)",
    marginBottom: "0.2rem",
  };

  return (
    <div
      className="captain-panel"
      style={{
        background: "var(--bg-panel)",
        border: `1px solid ${borderColor}`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Scanline texture for unresolved states */}
      {showScanlines && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(202, 245, 222, 0.02) 2px, rgba(202, 245, 222, 0.02) 4px)",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Title bar */}
      <div
        className="captain-panel-title"
        style={{
          padding: "0.5rem 0.85rem",
          borderBottom: `1px solid ${borderColor}`,
          background: titleBg,
        }}
      >
        <span
          style={{
            ...PANEL_FONT,
            fontSize: "0.6rem",
            fontWeight: 500,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: titleColor,
          }}
        >
          TRIBAL COMMAND — {titleTribeName}
        </span>
      </div>

      {/* Body */}
      <div className="captain-panel-body" style={{ padding: "1rem 0.85rem", display: "flex", flexDirection: "column", gap: "0.9rem", position: "relative" }}>
        {/* Identity */}
        <div>
          <div className="captain-panel-label" style={fieldLabel}>IDENTITY</div>
          <div className="captain-panel-value" style={{ ...PANEL_FONT, fontSize: "0.7rem", letterSpacing: "0.08em", color: identityColor }}>
            {identity}
          </div>
        </div>

        {/* Tribe */}
        <div>
          <div className="captain-panel-label" style={fieldLabel}>TRIBE</div>
          <div className="captain-panel-value" style={{ ...PANEL_FONT, fontSize: "0.7rem", letterSpacing: "0.08em", color: tribeDisplayColor }}>
            {tribeDisplay}
          </div>
        </div>

        {/* Tribe ID */}
        <div>
          <div className="captain-panel-label" style={fieldLabel}>TRIBE ID</div>
          <div className="captain-panel-value" style={{ ...PANEL_FONT, fontSize: "0.7rem", letterSpacing: "0.08em", color: tribeIdColor }}>
            {tribeIdDisplay}
          </div>
        </div>

        {/* Status */}
        <div>
          <div className="captain-panel-label" style={fieldLabel}>STATUS</div>
          <div className="captain-panel-value" style={{ ...PANEL_FONT, fontSize: "0.7rem", letterSpacing: "0.08em", color: valueColor }}>
            {statusText}
          </div>
        </div>
      </div>
    </div>
  );
}
