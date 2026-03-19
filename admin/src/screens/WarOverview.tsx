import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount, useCurrentClient } from "@mysten/dapp-kit-react";
import { LINEAGE_WAR_PACKAGE_ID } from "../lib/constants";
import { useAdminPortalState } from "../lib/admin-context";
import { formatTimestamp, shortenId, useAutoRegistryId, useOwnedAdminCaps, useRecentPublishedSystemConfigs } from "../lib/utils";

const cardStyle: React.CSSProperties = {
  padding: "1rem",
  border: "1px solid #27272a",
  borderRadius: 12,
  background: "#16161b",
};

function parseFields(content: unknown): Record<string, unknown> | null {
  if (!content || typeof content !== "object" || !("fields" in content)) {
    return null;
  }
  const fields = (content as { fields?: Record<string, unknown> }).fields;
  return fields ?? null;
}

export default function WarOverview() {
  const navigate = useNavigate();
  const client = useCurrentClient();
  const account = useCurrentAccount();
  const { setDraft, lastExecution, selectedAdminCapId, setSelectedAdminCapId } = useAdminPortalState();
  const ownedAdminCaps = useOwnedAdminCaps();

  useEffect(() => {
    if (!selectedAdminCapId && ownedAdminCaps.data?.length) {
      const sorted = [...ownedAdminCaps.data].sort((a, b) => Number(b.warId ?? 0) - Number(a.warId ?? 0));
      setSelectedAdminCapId(sorted[0].objectId);
    }
  }, [ownedAdminCaps.data, selectedAdminCapId, setSelectedAdminCapId]);

  const selectedAdminCap = ownedAdminCaps.data?.find((cap) => cap.objectId === selectedAdminCapId) ?? null;
  const resolvedRegistry = useAutoRegistryId(selectedAdminCap?.warId ?? null);

  const registryQuery = useQuery({
    queryKey: ["warRegistry", resolvedRegistry.registryId],
    enabled: resolvedRegistry.registryId !== "0x0",
    queryFn: async () => {
      const rpcClient = client as unknown as {
        getObject: (input: unknown) => Promise<{ data?: { content?: unknown } }>;
      };
      return rpcClient.getObject({ id: resolvedRegistry.registryId, options: { showContent: true } });
    },
  });

  const scheduleEventsQuery = useQuery({
    queryKey: ["scheduledChangeEvents", LINEAGE_WAR_PACKAGE_ID],
    enabled: LINEAGE_WAR_PACKAGE_ID !== "0x0",
    queryFn: async () => {
      const rpcClient = client as unknown as {
        queryEvents: (input: unknown) => Promise<{
          data?: Array<{ id?: { txDigest?: string }; parsedJson?: Record<string, unknown> }>;
        }>;
      };
      return rpcClient.queryEvents({
        query: { MoveEventType: `${LINEAGE_WAR_PACKAGE_ID}::schedule::ScheduledChangePublishedEvent` },
        order: "descending",
        limit: 5,
      });
    },
  });

  const systemEventsQuery = useQuery({
    queryKey: ["systemRegisteredEvents", LINEAGE_WAR_PACKAGE_ID],
    enabled: LINEAGE_WAR_PACKAGE_ID !== "0x0",
    queryFn: async () => {
      const rpcClient = client as unknown as {
        queryEvents: (input: unknown) => Promise<{
          data?: Array<{ id?: { txDigest?: string }; parsedJson?: Record<string, unknown> }>;
        }>;
      };
      return rpcClient.queryEvents({
        query: { MoveEventType: `${LINEAGE_WAR_PACKAGE_ID}::systems::SystemRegisteredEvent` },
        order: "descending",
        limit: 5,
      });
    },
  });

  const fields = parseFields(registryQuery.data?.data?.content);
  const warId = Number(fields?.war_id);
  const recentConfigs = useRecentPublishedSystemConfigs(
    5,
    Number.isFinite(warId) ? { warId } : undefined,
  );
  const isRegistryLoaded = Boolean(fields);

  const queueToggle = (action: "pause" | "resume") => {
    setDraft({
      kind: "toggle-war",
      action,
      registryId: resolvedRegistry.registryId,
      warId: Number.isFinite(warId) ? warId : 0,
      adminCapId: selectedAdminCapId,
      adminCapWarId: selectedAdminCap?.warId ?? null,
    });
    navigate("/preview");
  };

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <div>
        <h1 style={{ marginTop: 0 }}>War overview</h1>
        <p style={{ color: "#a1a1aa", maxWidth: 900 }}>
          This is the showrunner dashboard for the chain-authoritative state that already exists today: registry
          metadata, wallet-owned admin caps, and recent event activity. Richer effective-rule and active-system
          previews still belong to future resolver/contract expansion.
        </p>
      </div>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Registry</h2>
        {resolvedRegistry.registryId === "0x0" && !resolvedRegistry.isLoading && (
          <p style={{ color: "#fbbf24" }}>
            {selectedAdminCap
              ? "Could not auto-discover WarRegistry from chain events. Set VITE_WAR_REGISTRY_ID as fallback."
              : "Select an admin cap above to auto-discover the WarRegistry, or set VITE_WAR_REGISTRY_ID."}
          </p>
        )}
        {resolvedRegistry.isLoading && <p style={{ color: "#a1a1aa" }}>Discovering WarRegistry from chain…</p>}
        {registryQuery.isLoading && <p>Loading registry…</p>}
        {registryQuery.error && <p style={{ color: "#f87171" }}>Failed to load registry: {String(registryQuery.error)}</p>}
        {fields && (
          <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "0.5rem 1rem", margin: 0 }}>
            <dt>War ID</dt>
            <dd>{String(fields.war_id)}</dd>
            <dt>Display name</dt>
            <dd>{String(fields.display_name)}</dd>
            <dt>Slug</dt>
            <dd>{String(fields.slug)}</dd>
            <dt>Status</dt>
            <dd>
              {(() => {
                const endedRaw = fields.ended_at_ms;
                const endedMs = endedRaw != null ? Number(endedRaw) : null;
                const hasEnd = endedMs != null && Number.isFinite(endedMs) && endedMs > 0;
                if (hasEnd && endedMs <= Date.now()) {
                  return <span style={{ color: "#f87171", fontWeight: 600 }}>Ended at {formatTimestamp(endedMs)}</span>;
                }
                if (hasEnd && endedMs > Date.now()) {
                  return <span style={{ color: "#fbbf24", fontWeight: 600 }}>Ending at {formatTimestamp(endedMs)}</span>;
                }
                if (fields.enabled === false) {
                  return <span style={{ color: "#f59e0b", fontWeight: 600 }}>Paused</span>;
                }
                return <span style={{ color: "#22c55e", fontWeight: 600 }}>Running</span>;
              })()}
            </dd>
            <dt>Source of truth mode</dt>
            <dd>{String(fields.source_of_truth_mode)}</dd>
            <dt>Current config version</dt>
            <dd>{String(fields.current_war_config_version)}</dd>
          </dl>
        )}

        <div style={{ marginTop: "1rem", display: "grid", gap: "0.75rem" }}>
          <div>
            <strong>Configured IDs</strong>
            <div style={{ marginTop: "0.35rem", color: "#a1a1aa" }}>
              Package: <code>{LINEAGE_WAR_PACKAGE_ID}</code>
            </div>
            <div style={{ marginTop: "0.35rem", color: "#a1a1aa" }}>
              Registry: <code>{resolvedRegistry.registryId}</code>
              {resolvedRegistry.source === "chain" && (
                <span style={{ marginLeft: "0.5rem", color: "#22c55e", fontSize: "0.85em" }}>(auto-discovered)</span>
              )}
              {resolvedRegistry.source === "env" && (
                <span style={{ marginLeft: "0.5rem", color: "#71717a", fontSize: "0.85em" }}>(env override)</span>
              )}
            </div>
          </div>
          {!!ownedAdminCaps.data?.length && (
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>Choose wallet-owned admin cap</span>
              <select
                value={selectedAdminCapId}
                onChange={(event) => setSelectedAdminCapId(event.target.value)}
                style={{
                  padding: "0.65rem 0.75rem",
                  borderRadius: 8,
                  border: "1px solid #3f3f46",
                  background: "#0f0f12",
                  color: "#fff",
                }}
              >
                <option value="">Select a wallet-owned admin cap</option>
                {ownedAdminCaps.data.map((cap) => (
                  <option key={cap.objectId} value={cap.objectId}>
                    War {cap.warId ?? "?"} | {shortenId(cap.objectId, 10)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div style={{ marginTop: "1rem", display: "grid", gap: "0.75rem", gridTemplateColumns: "1fr auto auto" }}>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span>Admin cap for pause/resume</span>
            <input
              value={selectedAdminCapId}
              onChange={(event) => setSelectedAdminCapId(event.target.value)}
              style={{
                padding: "0.65rem 0.75rem",
                borderRadius: 8,
                border: "1px solid #3f3f46",
                background: "#0f0f12",
                color: "#fff",
              }}
            />
          </label>
          <button
            type="button"
            disabled={!selectedAdminCapId || !isRegistryLoaded}
            onClick={() => queueToggle("pause")}
            style={{
              alignSelf: "end",
              padding: "0.7rem 1rem",
              borderRadius: 8,
              border: "none",
              background: "#f59e0b",
              color: "#111",
              cursor: selectedAdminCapId && isRegistryLoaded ? "pointer" : "not-allowed",
            }}
          >
            Preview pause
          </button>
          <button
            type="button"
            disabled={!selectedAdminCapId || !isRegistryLoaded}
            onClick={() => queueToggle("resume")}
            style={{
              alignSelf: "end",
              padding: "0.7rem 1rem",
              borderRadius: 8,
              border: "none",
              background: "#22c55e",
              color: "#fff",
              cursor: selectedAdminCapId && isRegistryLoaded ? "pointer" : "not-allowed",
            }}
          >
            Preview resume
          </button>
        </div>
        {fields && selectedAdminCap && (
          <p
            style={{
              marginTop: "0.75rem",
              color: Number(fields.war_id) === selectedAdminCap.warId ? "#a1a1aa" : "#fbbf24",
            }}
          >
            {Number(fields.war_id) === selectedAdminCap.warId
              ? "Selected admin cap war ID matches the configured registry war ID."
              : "Selected admin cap war ID does not match the configured registry war ID."}
          </p>
        )}
      </section>

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Connected wallet</h2>
          <p style={{ marginBottom: "0.5rem" }}>
            {account ? (
              <>
                Connected as <code>{shortenId(account.address, 10)}</code>
              </>
            ) : (
              "No wallet connected."
            )}
          </p>
          {ownedAdminCaps.isLoading && <p>Loading owned admin caps…</p>}
          {ownedAdminCaps.error && <p style={{ color: "#f87171" }}>Failed to load admin caps: {String(ownedAdminCaps.error)}</p>}
          {!ownedAdminCaps.isLoading && !ownedAdminCaps.data?.length && (
            <p style={{ color: "#a1a1aa" }}>No `WarAdminCap` objects found for the connected wallet.</p>
          )}
          {!!ownedAdminCaps.data?.length && (
            <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
              {ownedAdminCaps.data.map((cap) => (
                <li key={cap.objectId}>
                  War {cap.warId ?? "?"}: <code>{shortenId(cap.objectId, 10)}</code>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Recent scheduled changes</h2>
          <p style={{ color: "#71717a" }}>
            Event-derived only. Cancellation state and effective-rule resolution still need a fuller indexer/resolver
            view.
          </p>
          {scheduleEventsQuery.isLoading && <p>Loading schedule events…</p>}
          {scheduleEventsQuery.error && (
            <p style={{ color: "#f87171" }}>Failed to load schedule events: {String(scheduleEventsQuery.error)}</p>
          )}
          <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
            {(scheduleEventsQuery.data?.data ?? []).map((event, index) => (
              <li key={`${event.id?.txDigest ?? "tx"}-${index}`}>
                Change {String(event.parsedJson?.change_id ?? "?")} for target {String(event.parsedJson?.target_id ?? "?")}
                {" at "}
                {formatTimestamp(Number(event.parsedJson?.effective_from_ms ?? 0))}
              </li>
            ))}
          </ul>
        </section>

        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Recent published system configs</h2>
          <p style={{ color: "#71717a" }}>
            These are derived from chain publish events plus the creating transactions, so operators can reuse real config IDs after refresh.
          </p>
          {recentConfigs.isLoading && <p>Loading recent configs…</p>}
          {recentConfigs.error && <p style={{ color: "#f87171" }}>Failed to load recent configs: {String(recentConfigs.error)}</p>}
          <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
            {(recentConfigs.data ?? []).map((config) => (
              <li key={config.objectId}>
                System {config.systemId ?? "?"}, version {config.version ?? "?"}: <code>{shortenId(config.objectId, 12)}</code>
              </li>
            ))}
          </ul>
        </section>

        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Recently registered systems</h2>
          <p style={{ color: "#71717a" }}>
            The contract emits system IDs, but not a registry-owned active-system list or display-name index.
          </p>
          {systemEventsQuery.isLoading && <p>Loading system events…</p>}
          {systemEventsQuery.error && <p style={{ color: "#f87171" }}>Failed to load system events: {String(systemEventsQuery.error)}</p>}
          <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
            {(systemEventsQuery.data?.data ?? []).map((event, index) => (
              <li key={`${event.id?.txDigest ?? "tx"}-${index}`}>System {String(event.parsedJson?.system_id ?? "?")}</li>
            ))}
          </ul>
        </section>
      </div>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Latest submitted transaction</h2>
        {!lastExecution ? (
          <p style={{ color: "#a1a1aa" }}>No transactions submitted from this browser session yet.</p>
        ) : (
          <>
            <p>
              Digest: <code>{lastExecution.digest}</code>
            </p>
            <p>Submitted at: {formatTimestamp(lastExecution.timestampMs)}</p>
            {!!lastExecution.createdObjectIds.length && (
              <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                {lastExecution.createdObjectIds.map((objectId) => (
                  <li key={objectId}>
                    Created object: <code>{shortenId(objectId, 12)}</code>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Current contract gaps</h2>
        <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
          <li>Phase config exists, but active-system membership is not stored on chain yet.</li>
          <li>System rule dynamic fields are effectively add-only; this UI does not pretend they can be removed in place.</li>
          <li>Authoritative effective-rule preview still requires resolver/indexer logic, not just raw contract reads.</li>
        </ul>
      </section>
    </div>
  );
}
