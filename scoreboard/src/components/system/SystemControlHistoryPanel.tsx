import ProgressMeter from "../telemetry/ProgressMeter";
import SectionLabel from "../telemetry/SectionLabel";

interface SystemControlHistoryPanelProps {
  tribeACycles: number;
  tribeBCycles: number;
  neutralCycles: number;
  tribeAName?: string;
  tribeBName?: string;
}

export default function SystemControlHistoryPanel({
  tribeACycles,
  tribeBCycles,
  neutralCycles,
  tribeAName = "Tribe Alpha",
  tribeBName = "Tribe Bravo",
}: SystemControlHistoryPanelProps) {
  const total = tribeACycles + tribeBCycles + neutralCycles || 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
      <SectionLabel>Control distribution</SectionLabel>

      <ProgressMeter
        value={tribeACycles / total}
        color="var(--mint)"
        label={tribeAName}
      />
      <ProgressMeter
        value={tribeBCycles / total}
        color="var(--tribe-b)"
        label={tribeBName}
      />
      <ProgressMeter
        value={neutralCycles / total}
        color="var(--neutral-state)"
        label="Neutral"
      />
    </div>
  );
}
