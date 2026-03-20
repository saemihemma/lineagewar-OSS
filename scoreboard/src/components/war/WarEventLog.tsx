import LogList, { type LogEntry } from "../telemetry/LogList";

interface WarEventLogProps {
  entries: LogEntry[];
}

export default function WarEventLog({ entries }: WarEventLogProps) {
  return <LogList entries={entries} maxHeight={260} />;
}
