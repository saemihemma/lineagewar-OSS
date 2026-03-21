import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import TerminalPanel from "../components/terminal/TerminalPanel";
import TerminalRouteFrame from "../components/terminal/TerminalRouteFrame";
import { VERIFIER_POLL_INTERVAL_MS, VERIFIER_SNAPSHOT_URL } from "../lib/constants";
import { formatUtcTimestamp } from "../lib/public-war";
import {
  buildAuditIndexUrl,
  fetchAuditIndex,
  fetchVerifierEnvelope,
} from "../lib/verifier";
import {
  presentAuditCategoryLabel,
  presentAuditSource,
  presentResolvedSystemName,
  presentSourceLabel,
  useResolvedSystemNames,
} from "../lib/verifier-presentation";

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
      {"<- WAR OVERVIEW"}
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

  const trackedSystemIds = index?.trackedSystems.map((system) => system.id) ?? [];
  const resolvedSystemNames = useResolvedSystemNames(trackedSystemIds, []);
  const provenanceRows = envelope?.audit
    ? (
        Object.entries(envelope.audit.inputs) as Array<
          [
            keyof typeof envelope.audit.inputs,
            (typeof envelope.audit.inputs)[keyof typeof envelope.audit.inputs],
          ]
        >
      ).map(([key, source]) => ({
        label: presentAuditCategoryLabel(key),
        presentation: presentAuditSource(source),
      }))
    : [];
  const trackedSystems = (index?.trackedSystems ?? []).map((system) => ({
    ...system,
    label:
      system.name.trim() && system.name.trim() !== system.id
        ? { primary: system.name.trim(), secondary: system.id }
        : presentResolvedSystemName(system.id, resolvedSystemNames),
  }));

  return (
    <TerminalRouteFrame
      title={`${envelope?.scoreboard?.warName ?? "Lineage War"} Audit Ledger`}
      meta={[
        { label: "SOURCE", value: presentSourceLabel(index?.sourceMode) },
        { label: "VERSION", value: index?.verifierVersion ?? "WAITING" },
        {
          label: "LATEST TICK",
          value: formatUtcTimestamp(index?.latestTickMs),
        },
      ]}
      status={index ? "ACTIVE" : "STANDBY"}
      right={backLink()}
      bodyStyle={{
        display: "grid",
        gridTemplateColumns: "1.2fr 1fr",
        gap: "1px",
        background: "var(--border-panel)",
        overflow: "hidden",
      }}
    >
      <div style={{ background: "var(--bg-terminal)", minHeight: 0 }}>
        <TerminalPanel title="HOURLY TICK LEDGER" accent="default" style={{ height: "100%", minHeight: 0 }}>
          {!useVerifier
            ? statusMessage("Audit ledger is unavailable while the score app is in mock mode.")
            : error
              ? statusMessage("Unable to load the public audit index.")
              : isLoading || !index
                ? statusMessage("Loading published audit ticks...")
                : (
                  <div style={{ display: "grid", gap: "0.35rem", height: "100%", minHeight: 0, overflowY: "auto", fontFamily: "IBM Plex Mono", fontSize: "0.68rem" }}>
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

      <div
        style={{
          background: "var(--bg-terminal)",
          display: "grid",
          gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: "1px",
          minHeight: 0,
        }}
      >
        <TerminalPanel title="INPUT PROVENANCE" accent="default" style={{ height: "100%", minHeight: 0 }}>
          {!useVerifier || !envelope?.audit
            ? statusMessage("Waiting for verifier audit metadata.")
            : (
              <div style={{ display: "grid", gap: "0.45rem", height: "100%", minHeight: 0, overflowY: "auto", fontFamily: "IBM Plex Mono", fontSize: "0.68rem" }}>
                {provenanceRows.map(({ label, presentation }) => (
                  <div key={label}>
                    <div style={{ color: "var(--text-dim)", marginBottom: "0.15rem" }}>{label}</div>
                    <div style={{ color: "var(--text)" }}>{presentation.primary}</div>
                    {presentation.secondary.map((line) => (
                      <div key={line} style={{ color: "var(--text-dim)" }}>{line}</div>
                    ))}
                  </div>
                ))}
              </div>
            )}
        </TerminalPanel>

        <TerminalPanel title="TRACKED SYSTEMS" accent="default" style={{ height: "100%", minHeight: 0 }}>
          {!index
            ? statusMessage("No tracked systems published yet.")
            : (
              <div style={{ display: "grid", gap: "0.3rem", height: "100%", minHeight: 0, overflowY: "auto", fontFamily: "IBM Plex Mono", fontSize: "0.68rem" }}>
                {trackedSystems.map((system) => (
                  <Link
                    key={system.id}
                    to={`/system/${system.id}`}
                    style={{ color: "var(--text)", textDecoration: "none" }}
                  >
                    <span>{system.label.primary}</span>
                    {system.label.secondary ? (
                      <span style={{ color: "var(--text-dim)" }}> [{system.label.secondary}]</span>
                    ) : null}
                  </Link>
                ))}
              </div>
            )}
        </TerminalPanel>
      </div>
    </TerminalRouteFrame>
  );
}
