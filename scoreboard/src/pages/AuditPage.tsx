import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import TerminalScreen from "../components/terminal/TerminalScreen";
import TerminalHeader from "../components/terminal/TerminalHeader";
import TerminalPanel from "../components/terminal/TerminalPanel";
import { VERIFIER_POLL_INTERVAL_MS, VERIFIER_SNAPSHOT_URL } from "../lib/constants";
import { formatUtcTimestamp } from "../lib/public-war";
import {
  buildAuditIndexUrl,
  fetchAuditIndex,
  fetchVerifierEnvelope,
} from "../lib/verifier";

const useVerifier = VERIFIER_SNAPSHOT_URL !== "";

function backLink() {
  return (
    <Link
      to="/war"
      style={{
        fontFamily: "IBM Plex Mono",
        fontSize: "0.65rem",
        letterSpacing: "0.1em",
        color: "var(--text-dim)",
        textDecoration: "none",
      }}
    >
      ← WAR OVERVIEW
    </Link>
  );
}

function statusMessage(message: string) {
  return (
    <div
      style={{
        color: "var(--text-dim)",
        fontFamily: "IBM Plex Mono",
        fontSize: "0.72rem",
        lineHeight: 1.6,
      }}
    >
      {message}
    </div>
  );
}

export default function AuditPage() {
  const auditIndexUrl = useVerifier ? buildAuditIndexUrl(VERIFIER_SNAPSHOT_URL) : "";
  const { data: envelope } = useQuery({
    queryKey: ["verifierEnvelope", VERIFIER_SNAPSHOT_URL],
    queryFn: () => fetchVerifierEnvelope(VERIFIER_SNAPSHOT_URL),
    enabled: useVerifier,
    refetchInterval:
      useVerifier && VERIFIER_POLL_INTERVAL_MS > 0 ? VERIFIER_POLL_INTERVAL_MS : false,
    refetchOnWindowFocus: true,
  });
  const { data: index, error, isLoading } = useQuery({
    queryKey: ["verifierAuditIndex", auditIndexUrl],
    queryFn: () => fetchAuditIndex(auditIndexUrl),
    enabled: useVerifier,
    refetchInterval:
      useVerifier && VERIFIER_POLL_INTERVAL_MS > 0 ? VERIFIER_POLL_INTERVAL_MS : false,
    refetchOnWindowFocus: true,
  });
  const systemDisplayNameById = new Map(
    (envelope?.systemDisplayConfigs ?? []).map((entry) => [entry.systemId, entry.displayName?.trim() ?? ""]),
  );
  const provenanceRows = envelope?.audit
    ? [
        { label: "CANDIDATES", source: envelope.audit.inputs.candidateCollection },
        { label: "ACTIVE SYSTEMS", source: envelope.audit.inputs.activeSystems },
        { label: "OWNER RESOLUTION", source: envelope.audit.inputs.ownerResolution },
        { label: "LOCATION RESOLUTION", source: envelope.audit.inputs.locationResolution },
      ]
    : [];

  return (
    <TerminalScreen>
      <TerminalHeader
        title={`${envelope?.scoreboard?.warName ?? "Lineage War"} Audit Ledger`}
        meta={[
          { label: "SOURCE", value: index?.sourceMode ?? "WAITING" },
          { label: "VERSION", value: index?.verifierVersion ?? "WAITING" },
          {
            label: "LATEST TICK",
            value: formatUtcTimestamp(index?.latestTickMs),
          },
        ]}
        status={index ? "ACTIVE" : "STANDBY"}
        right={backLink()}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr",
          gap: "1px",
          background: "var(--border-panel)",
          minHeight: "calc(100vh - 48px)",
        }}
      >
        <div style={{ background: "var(--bg-terminal)" }}>
          <TerminalPanel title="HOURLY TICK LEDGER" accent="default">
            {!useVerifier
              ? statusMessage("Audit ledger is unavailable while the score app is in mock mode.")
              : error
                ? statusMessage("Unable to load the public audit index.")
                : isLoading || !index
                  ? statusMessage("Loading published audit ticks...")
                  : (
                    <div style={{ display: "grid", gap: "0.35rem", fontFamily: "IBM Plex Mono", fontSize: "0.68rem" }}>
                      {index.availableTicks.length === 0 ? (
                        <div style={{ color: "var(--text-dim)" }}>No published ticks yet.</div>
                      ) : (
                        index.availableTicks
                          .slice()
                          .reverse()
                          .map((tick) => (
                            <Link
                              key={tick.tickTimestampMs}
                              to={`/audit/tick/${tick.tickTimestampMs}`}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1.4fr 0.8fr 0.8fr",
                                gap: "0.75rem",
                                textDecoration: "none",
                                color: "var(--text)",
                                padding: "0.45rem 0.35rem",
                                borderBottom: "1px solid var(--border-grid)",
                              }}
                            >
                              <span>{formatUtcTimestamp(tick.tickTimestampMs)}</span>
                              <span style={{ color: "var(--text-dim)" }}>{tick.systemCount} systems</span>
                              <span style={{ color: "var(--mint)" }}>OPEN</span>
                            </Link>
                          ))
                      )}
                    </div>
                  )}
          </TerminalPanel>
        </div>

        <div style={{ background: "var(--bg-terminal)", display: "grid", gap: "1px" }}>
          <TerminalPanel title="INPUT PROVENANCE" accent="default">
            {!useVerifier || !envelope?.audit
              ? statusMessage("Waiting for verifier audit metadata.")
              : (
                <div style={{ display: "grid", gap: "0.45rem", fontFamily: "IBM Plex Mono", fontSize: "0.68rem" }}>
                  {provenanceRows.map(({ label, source }) => (
                    <div key={label}>
                      <div style={{ color: "var(--text-dim)", marginBottom: "0.15rem" }}>{label}</div>
                      <div style={{ color: "var(--text)" }}>{source.mode}</div>
                      {source.detail ? <div style={{ color: "var(--text-dim)" }}>{source.detail}</div> : null}
                      {source.path ? <div style={{ color: "var(--yellow-dim)" }}>{source.path}</div> : null}
                    </div>
                  ))}
                </div>
              )}
          </TerminalPanel>

          <TerminalPanel title="TRACKED SYSTEMS" accent="default">
            {!index
              ? statusMessage("No tracked systems published yet.")
              : (
                <div style={{ display: "grid", gap: "0.3rem", fontFamily: "IBM Plex Mono", fontSize: "0.68rem" }}>
                  {index.trackedSystems.map((system) => (
                    <Link
                      key={system.id}
                      to={`/system/${system.id}`}
                      style={{ color: "var(--text)", textDecoration: "none" }}
                    >
                      {system.id} // {systemDisplayNameById.get(system.id) || system.name}
                    </Link>
                  ))}
                </div>
              )}
          </TerminalPanel>
        </div>
      </div>
    </TerminalScreen>
  );
}
