interface LegendItem {
  color: string;
  label: string;
}

interface MapLegendProps {
  tribes?: LegendItem[];
}

const defaultTribes: LegendItem[] = [
  { color: "var(--mint)", label: "Tribe A" },
  { color: "var(--tribe-b)", label: "Tribe B" },
];

export default function MapLegend({ tribes = defaultTribes }: MapLegendProps) {
  const items = [...tribes.slice(0, 2), { color: "var(--yellow)", label: "Contested" }, { color: "var(--neutral-state)", label: "Neutral" }];

  return (
    <div
      style={{
        display: "flex",
        gap: "1rem",
        justifyContent: "flex-end",
        padding: "0.4rem 0.1rem 0",
        fontFamily: "IBM Plex Mono",
        fontSize: "0.6rem",
        letterSpacing: "0.1em",
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}
        >
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: item.color,
            }}
          />
          <span style={{ color: "var(--text-dim)" }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
