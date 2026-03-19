import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CONTROL_STATE_OPTIONS } from "../lib/constants";
import { useAdminPortalState } from "../lib/admin-context";
import {
  formatTimestamp,
  parseDateTimeLocalToMs,
  shortenId,
  toDateTimeLocalValue,
  useOwnedAdminCaps,
  useRecentPublishedSystemConfigs,
} from "../lib/utils";
import type { ControlState } from "../lib/types";

const cardStyle: React.CSSProperties = {
  padding: "1rem",
  border: "1px solid #27272a",
  borderRadius: 12,
  background: "#16161b",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.65rem 0.75rem",
  borderRadius: 8,
  border: "1px solid #3f3f46",
  background: "#0f0f12",
  color: "#fff",
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: "0.35rem",
};

export default function SnapshotScreen() {
  const navigate = useNavigate();
  const { setDraft } = useAdminPortalState();
  const ownedAdminCaps = useOwnedAdminCaps();

  const [warId, setWarId] = useState("1");
  const [systemId, setSystemId] = useState("3001");
  const [tickTimestampLocal, setTickTimestampLocal] = useState(toDateTimeLocalValue(Date.now()));
  const [state, setState] = useState<ControlState>(2);
  const [controllerTribeId, setControllerTribeId] = useState("");
  const [pointsAwarded, setPointsAwarded] = useState("");
  const [configVersionId, setConfigVersionId] = useState("");
  const [selectedRecentConfigId, setSelectedRecentConfigId] = useState("");
  const [snapshotHashHex, setSnapshotHashHex] = useState("");
  const [adminCapId, setAdminCapId] = useState("");
  const [verifierPrepared, setVerifierPrepared] = useState(false);
  const parsedWarId = Number(warId);
  const parsedSystemId = Number(systemId);
  const recentConfigs = useRecentPublishedSystemConfigs(
    10,
    {
      warId: Number.isFinite(parsedWarId) && parsedWarId > 0 ? parsedWarId : null,
      systemId: Number.isFinite(parsedSystemId) && parsedSystemId > 0 ? parsedSystemId : null,
    },
  );
  const selectedAdminCap = ownedAdminCaps.data?.find((cap) => cap.objectId === adminCapId) ?? null;
  const selectedRecentConfig = recentConfigs.data?.find((entry) => entry.objectId === configVersionId.trim()) ?? null;

  useEffect(() => {
    if (!adminCapId && ownedAdminCaps.data?.length) {
      setAdminCapId(ownedAdminCaps.data[0].objectId);
    }
  }, [adminCapId, ownedAdminCaps.data]);

  const applyRecentConfig = (configId: string) => {
    setSelectedRecentConfigId(configId);
    const config = recentConfigs.data?.find((entry) => entry.objectId === configId);
    if (!config) {
      setConfigVersionId(configId);
      return;
    }

    setConfigVersionId(config.objectId);
  };

  const previewSnapshot = () => {
    setDraft({
      kind: "commit-snapshot",
      warId: parsedWarId || 0,
      systemId: parsedSystemId || 0,
      tickTimestampMs: parseDateTimeLocalToMs(tickTimestampLocal) ?? Date.now(),
      state,
      controllerTribeId: controllerTribeId.trim() ? Number(controllerTribeId) : null,
      pointsAwarded: Number(pointsAwarded) || 0,
      configVersionId: configVersionId.trim(),
      snapshotHashHex: snapshotHashHex.trim(),
      adminCapId: adminCapId.trim(),
      adminCapWarId: selectedAdminCap?.warId ?? null,
      configWarId: selectedRecentConfig?.warId ?? null,
      configSystemId: selectedRecentConfig?.systemId ?? null,
    });
    navigate("/preview");
  };

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <div>
        <h1 style={{ marginTop: 0 }}>Snapshot submission</h1>
        <p style={{ color: "#a1a1aa", maxWidth: 860 }}>
          This screen is intentionally explicit and a little manual. Snapshot commits should usually come from the
          verifier, so the UI helps with submission but does not pretend to explain or recompute the score locally.
        </p>
      </div>

      <section style={cardStyle}>
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.85rem 1rem",
            borderRadius: 10,
            border: "1px solid #3f3f46",
            background: "#101015",
            color: "#d4d4d8",
          }}
        >
          Paste values produced by the verifier or commit manifest. This screen exists as an operator utility for
          verifier-led submission, not as a place to author score truth by hand.
        </div>
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <label style={labelStyle}>
            <span>War ID</span>
            <input style={inputStyle} value={warId} onChange={(event) => setWarId(event.target.value)} />
          </label>
          <label style={labelStyle}>
            <span>System ID</span>
            <input style={inputStyle} value={systemId} onChange={(event) => setSystemId(event.target.value)} />
          </label>
          <label style={labelStyle}>
            <span>Tick timestamp</span>
            <input
              style={inputStyle}
              type="datetime-local"
              value={tickTimestampLocal}
              onChange={(event) => setTickTimestampLocal(event.target.value)}
            />
          </label>
          <label style={labelStyle}>
            <span>Control state</span>
            <select
              style={inputStyle}
              value={state}
              onChange={(event) => setState(Number(event.target.value) as ControlState)}
            >
              {CONTROL_STATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value} - {option.label}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            <span>Controller tribe ID (optional)</span>
            <input
              style={inputStyle}
              value={controllerTribeId}
              onChange={(event) => setControllerTribeId(event.target.value)}
            />
          </label>
          <label style={labelStyle}>
            <span>Points awarded</span>
            <input style={inputStyle} value={pointsAwarded} onChange={(event) => setPointsAwarded(event.target.value)} />
          </label>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
            <span>Recent published system config</span>
            <select
              style={inputStyle}
              value={selectedRecentConfigId}
              onChange={(event) => applyRecentConfig(event.target.value)}
              disabled={!recentConfigs.data?.length}
            >
              <option value="">Select a recent published config from chain</option>
              {(recentConfigs.data ?? []).map((config) => (
                <option key={config.objectId} value={config.objectId}>
                  War {config.warId ?? "?"} | System {config.systemId ?? "?"} | version {config.version ?? "?"} |{" "}
                  {shortenId(config.objectId, 10)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
            <span>Config version object ID</span>
            <input style={inputStyle} value={configVersionId} onChange={(event) => setConfigVersionId(event.target.value)} />
          </label>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
            <span>Snapshot hash hex</span>
            <input style={inputStyle} value={snapshotHashHex} onChange={(event) => setSnapshotHashHex(event.target.value)} />
          </label>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
            <span>Choose wallet-owned admin cap</span>
            <select
              style={inputStyle}
              value={adminCapId}
              onChange={(event) => setAdminCapId(event.target.value)}
              disabled={!ownedAdminCaps.data?.length}
            >
              <option value="">Select a wallet-owned admin cap</option>
              {(ownedAdminCaps.data ?? []).map((cap) => (
                <option key={cap.objectId} value={cap.objectId}>
                  War {cap.warId ?? "?"} | {shortenId(cap.objectId, 10)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
            <span>War admin cap ID</span>
            <input style={inputStyle} value={adminCapId} onChange={(event) => setAdminCapId(event.target.value)} />
          </label>
        </div>

        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "1rem" }}>
          <input
            type="checkbox"
            checked={verifierPrepared}
            onChange={(event) => setVerifierPrepared(event.target.checked)}
          />
          <span>I am submitting verifier-produced snapshot inputs, not inventing score state locally.</span>
        </label>

        <div style={{ marginTop: "1rem", display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={previewSnapshot}
            disabled={!configVersionId.trim() || !adminCapId.trim() || !snapshotHashHex.trim() || !verifierPrepared}
            style={{
              padding: "0.7rem 1rem",
              borderRadius: 8,
              border: "none",
              background:
                configVersionId.trim() && adminCapId.trim() && snapshotHashHex.trim() && verifierPrepared ? "#22c55e" : "#3f3f46",
              color: "#fff",
              cursor:
                configVersionId.trim() && adminCapId.trim() && snapshotHashHex.trim() && verifierPrepared
                  ? "pointer"
                  : "not-allowed",
            }}
          >
            Preview snapshot commit
          </button>
          <span style={{ color: "#71717a" }}>
            Provide the verifier-produced config object, controller result, and snapshot hash rather than inventing a local explanation layer.
          </span>
        </div>

        {recentConfigs.isLoading && <p style={{ marginTop: "1rem", color: "#a1a1aa" }}>Loading recent published system configs…</p>}
        {recentConfigs.error && (
          <p style={{ marginTop: "1rem", color: "#f87171" }}>Failed to load recent system configs: {String(recentConfigs.error)}</p>
        )}
        {!!recentConfigs.data?.length && (
          <p style={{ marginTop: "1rem", color: "#a1a1aa" }}>
            Snapshot submission can reuse recent chain-discovered `SystemConfigVersion` objects filtered to the currently
            entered war/system.
          </p>
        )}
        {selectedAdminCap && (
          <p style={{ marginTop: "0.5rem", color: selectedAdminCap.warId === parsedWarId ? "#a1a1aa" : "#fbbf24" }}>
            {selectedAdminCap.warId === parsedWarId
              ? "Selected admin cap matches the snapshot war ID."
              : "Selected admin cap war ID does not match the snapshot war ID."}
          </p>
        )}
        {selectedRecentConfig && (
          <p
            style={{
              marginTop: "0.5rem",
              color:
                selectedRecentConfig.warId === parsedWarId && selectedRecentConfig.systemId === parsedSystemId
                  ? "#a1a1aa"
                  : "#fbbf24",
            }}
          >
            {selectedRecentConfig.warId === parsedWarId && selectedRecentConfig.systemId === parsedSystemId
              ? "Selected config matches the currently entered war/system."
              : "Selected config does not match the currently entered war/system."}
          </p>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Owned admin caps</h2>
        {recentConfigs.data?.[0]?.effectiveFromMs && (
          <p style={{ color: "#a1a1aa" }}>Most recent config effective time: {formatTimestamp(recentConfigs.data[0].effectiveFromMs)}</p>
        )}
        {ownedAdminCaps.isLoading && <p>Loading admin caps…</p>}
        {ownedAdminCaps.error && <p style={{ color: "#f87171" }}>Failed to load admin caps: {String(ownedAdminCaps.error)}</p>}
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
    </div>
  );
}
