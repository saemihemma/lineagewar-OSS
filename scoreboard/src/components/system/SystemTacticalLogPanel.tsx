import LogList, { type LogEntry } from "../telemetry/LogList";

interface SystemTacticalLogPanelProps {
  entries: LogEntry[];
  systemName: string;
}

export default function SystemTacticalLogPanel({
  entries,
  systemName,
}: SystemTacticalLogPanelProps) {
  const filtered = entries.filter(
    (e) => e.text.toLowerCase().includes(systemName.toLowerCase()),
  );

  return (
    <LogList
      entries={filtered.length > 0 ? filtered : entries}
      maxHeight={220}
    />
  );
}
