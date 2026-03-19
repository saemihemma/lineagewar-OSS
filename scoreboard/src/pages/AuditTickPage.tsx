import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import TerminalScreen from "../components/terminal/TerminalScreen";
import TerminalHeader from "../components/terminal/TerminalHeader";
import TerminalPanel from "../components/terminal/TerminalPanel";
import { VERIFIER_SNAPSHOT_URL } from "../lib/constants";
import { formatUtcTimestamp } from "../lib/public-war";
import {
  buildAuditArtifactUrl,
  buildAuditIndexUrl,
  fetchAuditIndex,
  fetchTickAuditArtifact,
  fetchTickReceipt,
} from "../lib/verifier";
import { fallbackTribeName } from "../lib/public-war";

const useVerifier = VERIFIER_SNAPSHOT_URL !== "";

function backLink() {
  return (
    <Link
      to="/audit"
      style={{
        fontFamily: "IBM Plex Mono",
        fontSize: "0.65rem",
        letterSpacing: "0.1em",
        color: "var(--text-dim)",
        textDecoration: "none",
      }}
    >
      ← AUDIT LEDGER
    </Link>
  );
}

function renderMessage(title: string, message: string) {
  return (
    <TerminalScreen>
      <TerminalHeader title={title} status="STANDBY" right={backLink()} />
      <div style={{ padding: "3rem", color: "var(--text-dim)", fontFamily: "IBM Plex Mono" }}>{message}</div>
    </TerminalScreen>
  );
}

export default function AuditTickPage() {
  const { tickTimestamp } = useParams<{ tickTimestamp: string }>();
  const parsedTick = tickTimestamp ? Number(tickTimestamp) : NaN;
  const auditIndexUrl = useVerifier ? buildAuditIndexUrl(VERIFIER_SNAPSHOT_URL) : "";

  const { data: index, error: indexError, isLoading: indexLoading } = useQuery({
    queryKey: ["verifierAuditIndex", auditIndexUrl],
    queryFn: () => fetchAuditIndex(auditIndexUrl),
    enabled: useVerifier && Number.isFinite(parsedTick),
  });

  const selectedTick = useMemo(
    () => index?.availableTicks.find((entry) => entry.tickTimestampMs === parsedTick) ?? null,
    [index, parsedTick],
  );
  const tickArtifactUrl = selectedTick ? buildAuditArtifactUrl(auditIndexUrl, selectedTick.path) : "";
  const receiptUrl = selectedTick ? buildAuditArtifactUrl(auditIndexUrl, selectedTick.receiptPath) : "";

  const { data: artifact, error: artifactError, isLoading: artifactLoading } = useQuery({
    queryKey: ["verifierTickArtifact", tickArtifactUrl],
    queryFn: () => fetchTickAuditArtifact(tickArtifactUrl),
    enabled: Boolean(selectedTick && tickArtifactUrl),
  });
  const { data: receipt } = useQuery({
    queryKey: ["verifierTickReceipt", receiptUrl],
    queryFn: async () => {
      try {
        return await fetchTickReceipt(receiptUrl);
      } catch {
        return null;
      }
    },
    enabled: Boolean(selectedTick && receiptUrl),
    retry: false,
  });

  if (!useVerifier) {
    return renderMessage("AUDIT TICK", "Tick audit pages are unavailable while the score app is in mock mode.");
  }
  if (!Number.isFinite(parsedTick)) {
    return renderMessage("AUDIT TICK", "Tick route is missing a valid timestamp.");
  }
  if (indexError) {
    return renderMessage("AUDIT TICK", "Unable to load the published audit index.");
  }
  if (artifactError) {
    return renderMessage("AUDIT TICK", "Unable to load the published tick artifact.");
  }
  if (indexLoading || artifactLoading || !index || !selectedTick || !artifact) {
    return renderMessage("AUDIT TICK", "Loading published tick artifact...");
  }

  return (
    <TerminalScreen>
      <TerminalHeader
        title={`Tick ${formatUtcTimestamp(artifact.tickTimestampMs)}`}
        meta={[
          { label: "SOURCE", value: artifact.sourceMode },
          { label: "SYSTEMS", value: String(artifact.systems.length) },
          { label: "VERSION", value: artifact.verifierVersion },
        ]}
        status="ACTIVE"
        right={backLink()}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.3fr 1fr",
          gap: "1px",
          background: "var(--border-panel)",
          minHeight: "calc(100vh - 48px)",
        }}
      >
        <div style={{ background: "var(--bg-terminal)" }}>
          <TerminalPanel title="SYSTEM SNAPSHOTS" accent="default">
            <div style={{ display: "grid", gap: "0.45rem", fontFamily: "IBM Plex Mono", fontSize: "0.67rem" }}>
              {artifact.systems.map((system) => {
                const displayName = system.editorialDisplay?.displayName?.trim() || String(system.systemId);
                const receiptResult = receipt?.results.find(
                  (entry) =>
                    entry.systemId === system.systemId &&
                    entry.tickTimestampMs === artifact.tickTimestampMs,
                );
                return (
                  <div
                    key={system.systemId}
                    style={{ borderBottom: "1px solid var(--border-grid)", paddingBottom: "0.45rem" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
                      <Link to={`/system/${system.systemId}`} style={{ color: "var(--mint)", textDecoration: "none" }}>
                        SYSTEM {system.systemId} // {displayName}
                      </Link>
                      <span style={{ color: "var(--text-dim)" }}>{system.snapshot.state}</span>
                    </div>
                    <div style={{ color: "var(--text)" }}>
                      Controller:{" "}
                      {system.snapshot.controllerTribeId === null
                        ? "None"
                        : artifact.scoreboard?.tribeScores.find(
                            (tribe) => tribe.id === system.snapshot.controllerTribeId,
                          )?.name ?? fallbackTribeName(system.snapshot.controllerTribeId)}
                    </div>
                    <div style={{ color: "var(--text)" }}>Points awarded: {system.commitment.pointsAwarded}</div>
                    <div style={{ color: "var(--text)" }}>
                      Config version: {system.snapshot.config.systemConfigVersion}
                    </div>
                    <div style={{ marginTop: "0.35rem", color: "var(--text-dim)" }}>Mechanical rule inputs</div>
                    <div style={{ color: "var(--text)" }}>
                      Points per tick: {system.snapshot.explanation.pointsPerTick}
                    </div>
                    <div style={{ color: "var(--text)" }}>
                      Storage mode: {system.snapshot.explanation.storageRequirementMode}
                    </div>
                    <div style={{ color: "var(--text)" }}>
                      Assembly families: {system.snapshot.explanation.allowedAssemblyFamilies.join(", ") || "none"}
                    </div>
                    <div style={{ color: "var(--text)" }}>
                      Required item types: {system.snapshot.explanation.requiredItemTypeIds.join(", ") || "none"}
                    </div>
                    <div style={{ marginTop: "0.35rem", color: "var(--text-dim)" }}>Editorial display copy</div>
                    <div style={{ color: "var(--text)" }}>
                      Display name: {displayName}
                    </div>
                    <div style={{ color: "var(--text)" }}>
                      Rule text: {system.editorialDisplay?.publicRuleText || "—"}
                    </div>
                    <div style={{ color: "var(--yellow-dim)", wordBreak: "break-all" }}>
                      Snapshot hash: {system.commitment.snapshotHash}
                    </div>
                    <div style={{ color: receiptResult?.digest ? "var(--mint)" : "var(--text-dim)" }}>
                      Commit receipt: {receiptResult?.digest ?? "not published yet"}
                    </div>
                    <div style={{ color: "var(--text-dim)" }}>
                      Presence rows: {system.presenceRows.length} | Candidate assemblies: {system.candidateAssemblies.length}
                    </div>
                  </div>
                );
              })}
            </div>
          </TerminalPanel>
        </div>

        <div style={{ background: "var(--bg-terminal)", display: "grid", gap: "1px" }}>
          <TerminalPanel title="TICK TOTALS" accent="default">
            <div style={{ display: "grid", gap: "0.35rem", fontFamily: "IBM Plex Mono", fontSize: "0.68rem" }}>
              <div style={{ color: "var(--text)" }}>
                Tick label: {artifact.scoreboard?.tick ?? "n/a"}
              </div>
              {(artifact.scoreboard?.tribeScores ?? []).map((tribe) => (
                <div key={tribe.id} style={{ color: tribe.color }}>
                  {tribe.name}: {tribe.points}
                </div>
              ))}
            </div>
          </TerminalPanel>

          <TerminalPanel title="INPUT PROVENANCE" accent="default">
            <div style={{ display: "grid", gap: "0.45rem", fontFamily: "IBM Plex Mono", fontSize: "0.68rem" }}>
              {[
                ["CANDIDATES", artifact.inputs.candidateCollection.mode],
                ["ACTIVE SYSTEMS", artifact.inputs.activeSystems.mode],
                ["OWNER RESOLUTION", artifact.inputs.ownerResolution.mode],
                ["LOCATION RESOLUTION", artifact.inputs.locationResolution.mode],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ color: "var(--text-dim)" }}>{label}</div>
                  <div style={{ color: "var(--text)" }}>{value}</div>
                </div>
              ))}
            </div>
          </TerminalPanel>

          <TerminalPanel title="COMMIT STATUS" accent="default">
            <div style={{ display: "grid", gap: "0.35rem", fontFamily: "IBM Plex Mono", fontSize: "0.68rem" }}>
              <div style={{ color: receipt ? "var(--mint)" : "var(--text-dim)" }}>
                Receipt file: {receipt ? "published" : "not found"}
              </div>
              <div style={{ color: "var(--text)" }}>Mode: {receipt?.mode ?? "pending"}</div>
              <div style={{ color: "var(--text)" }}>
                Result count: {receipt?.results.length ?? 0}
              </div>
              <div style={{ color: "var(--text-dim)", wordBreak: "break-all" }}>
                Expected receipt path: {artifact.receiptPath}
              </div>
            </div>
          </TerminalPanel>
        </div>
      </div>
    </TerminalScreen>
  );
}
