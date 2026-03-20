import ProgressMeter from "../telemetry/ProgressMeter";
import SectionLabel from "../telemetry/SectionLabel";

interface InfrastructureItem {
  label: string;
  value: number; // 0..1
  count?: number;
  type: "tribeA" | "tribeB" | "neutral";
}

interface SystemInfrastructurePanelProps {
  items: InfrastructureItem[];
}

const typeColor: Record<string, string> = {
  tribeA: "var(--mint)",
  tribeB: "var(--tribe-b)",
  neutral: "var(--neutral-state)",
};

export default function SystemInfrastructurePanel({
  items,
}: SystemInfrastructurePanelProps) {
  if (items.length === 0) {
    return (
      <div
        style={{
          color: "var(--text-dim)",
          fontFamily: "IBM Plex Mono",
          fontSize: "0.7rem",
          textAlign: "center",
          padding: "1rem 0",
        }}
      >
        No infrastructure data available
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
      <SectionLabel>Infrastructure status</SectionLabel>
      {items.map((item) => (
        <div key={item.label} style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <ProgressMeter
            value={item.value}
            color={typeColor[item.type]}
            label={item.label}
          />
          {item.count !== undefined && (
            <div
              style={{
                fontFamily: "IBM Plex Mono",
                fontSize: "0.6rem",
                color: "var(--text-dim)",
                textAlign: "right",
              }}
            >
              {item.count} units
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
