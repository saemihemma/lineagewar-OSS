import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SCHEDULE_TARGET_OPTIONS } from "../lib/constants";
import { useAdminPortalState } from "../lib/admin-context";
import {
  formatTimestamp,
  parseDateTimeLocalToMs,
  shortenId,
  toDateTimeLocalValue,
  useOwnedAdminCaps,
  useRecentPublishedSystemConfigs,
} from "../lib/utils";
import type { ScheduleTargetKind } from "../lib/types";

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

type TimePreset = "now" | "15m" | "1h" | "1w" | "custom";

function presetToTimestamp(preset: TimePreset, customValue: string): number {
  const now = Date.now();
  switch (preset) {
    case "now":
      return now;
    case "15m":
      return now + 15 * 60_000;
    case "1h":
      return now + 60 * 60_000;
    case "1w":
      return now + 7 * 24 * 60 * 60_000;
    case "custom":
      return parseDateTimeLocalToMs(customValue) ?? now;
  }
}

export default function ScheduleScreen() {
  const navigate = useNavigate();
  const { setDraft } = useAdminPortalState();
  const ownedAdminCaps = useOwnedAdminCaps();

  const [warId, setWarId] = useState("1");
  const [changeId, setChangeId] = useState(String(Date.now()));
  const [targetKind, setTargetKind] = useState<ScheduleTargetKind>(2);
  const [targetSystemId, setTargetSystemId] = useState("3001");
  const [configObjectId, setConfigObjectId] = useState("");
  const [adminCapId, setAdminCapId] = useState("");
  const [selectedRecentConfigId, setSelectedRecentConfigId] = useState("");
  const [preset, setPreset] = useState<TimePreset>("15m");
  const [customDateTime, setCustomDateTime] = useState(toDateTimeLocalValue(Date.now() + 15 * 60_000));
  const parsedWarId = Number(warId);
  const parsedTargetSystemId = Number(targetSystemId);
  const recentConfigs = useRecentPublishedSystemConfigs(
    10,
    {
      warId: Number.isFinite(parsedWarId) && parsedWarId > 0 ? parsedWarId : null,
      systemId: Number.isFinite(parsedTargetSystemId) && parsedTargetSystemId > 0 ? parsedTargetSystemId : null,
    },
  );
  const selectedAdminCap = ownedAdminCaps.data?.find((cap) => cap.objectId === adminCapId) ?? null;
  const selectedRecentConfig = recentConfigs.data?.find((entry) => entry.objectId === configObjectId.trim()) ?? null;

  useEffect(() => {
    if (!adminCapId && ownedAdminCaps.data?.length) {
      setAdminCapId(ownedAdminCaps.data[0].objectId);
    }
  }, [adminCapId, ownedAdminCaps.data]);

  const effectiveFromMs = useMemo(() => presetToTimestamp(preset, customDateTime), [customDateTime, preset]);

  const applyRecentConfig = (configId: string) => {
    setSelectedRecentConfigId(configId);
    const config = recentConfigs.data?.find((entry) => entry.objectId === configId);
    if (!config) {
      setConfigObjectId(configId);
      return;
    }

    setConfigObjectId(config.objectId);
    if (config.warId !== null) {
      setWarId(String(config.warId));
    }
    if (config.systemId !== null) {
      setTargetSystemId(String(config.systemId));
    }
  };

  const previewSchedule = () => {
    setDraft({
      kind: "schedule-system-change",
      warId: parsedWarId || 0,
      changeId: Number(changeId) || 0,
      targetSystemId: parsedTargetSystemId || 0,
      configObjectId: configObjectId.trim(),
      effectiveFromMs,
      createdAtMs: Date.now(),
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
        <h1 style={{ marginTop: 0 }}>Schedule</h1>
        <p style={{ color: "#a1a1aa", maxWidth: 900 }}>
          Schedule a future config activation instead of mutating live rules invisibly. The current contract exposes a
          direct wrapper only for system config scheduling, so that is the functional path here.
        </p>
      </div>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Schedule a change</h2>
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <label style={labelStyle}>
            <span>Target kind</span>
            <select
              style={inputStyle}
              value={targetKind}
              onChange={(event) => setTargetKind(Number(event.target.value) as ScheduleTargetKind)}
            >
              {SCHEDULE_TARGET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value} - {option.label}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            <span>War ID</span>
            <input style={inputStyle} value={warId} onChange={(event) => setWarId(event.target.value)} />
          </label>
          <label style={labelStyle}>
            <span>Change ID</span>
            <input style={inputStyle} value={changeId} onChange={(event) => setChangeId(event.target.value)} />
          </label>
          <label style={labelStyle}>
            <span>Target system ID</span>
            <input style={inputStyle} value={targetSystemId} onChange={(event) => setTargetSystemId(event.target.value)} />
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
                  System {config.systemId ?? "?"} | version {config.version ?? "?"} | {shortenId(config.objectId, 10)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
            <span>Published system config object ID</span>
            <input style={inputStyle} value={configObjectId} onChange={(event) => setConfigObjectId(event.target.value)} />
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
            <span>Admin cap ID</span>
            <input style={inputStyle} value={adminCapId} onChange={(event) => setAdminCapId(event.target.value)} />
          </label>
        </div>

        <div style={{ marginTop: "1rem", display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label style={labelStyle}>
            <span>Effective time preset</span>
            <select style={inputStyle} value={preset} onChange={(event) => setPreset(event.target.value as TimePreset)}>
              <option value="now">Now</option>
              <option value="15m">In 15 minutes</option>
              <option value="1h">In 1 hour</option>
              <option value="1w">In 1 week</option>
              <option value="custom">Custom datetime</option>
            </select>
          </label>
          <label style={labelStyle}>
            <span>Custom datetime</span>
            <input
              style={inputStyle}
              type="datetime-local"
              value={customDateTime}
              onChange={(event) => setCustomDateTime(event.target.value)}
              disabled={preset !== "custom"}
            />
          </label>
          <div style={{ ...labelStyle, alignSelf: "end" }}>
            <span>Resolved effective time</span>
            <div style={{ padding: "0.65rem 0.75rem", borderRadius: 8, background: "#0f0f12", border: "1px solid #3f3f46" }}>
              {formatTimestamp(effectiveFromMs)}
            </div>
          </div>
        </div>

        {recentConfigs.isLoading && <p style={{ marginTop: "1rem", color: "#a1a1aa" }}>Loading recent published system configs…</p>}
        {recentConfigs.error && (
          <p style={{ marginTop: "1rem", color: "#f87171" }}>Failed to load recent system configs: {String(recentConfigs.error)}</p>
        )}
        {!!recentConfigs.data?.length && (
          <div style={{ marginTop: "1rem" }}>
            <p style={{ color: "#a1a1aa", marginBottom: "0.5rem" }}>
              Recent configs are filtered to the currently entered war/system and derived from on-chain publish events plus
              their creating transactions.
            </p>
            <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
              {recentConfigs.data.slice(0, 5).map((config) => (
                <li key={config.objectId}>
                  System {config.systemId ?? "?"}, version {config.version ?? "?"}, effective {formatTimestamp(config.effectiveFromMs)}:{" "}
                  <code>{shortenId(config.objectId, 12)}</code>
                </li>
              ))}
            </ul>
          </div>
        )}

        {selectedAdminCap && (
          <p style={{ marginTop: "1rem", color: selectedAdminCap.warId === parsedWarId ? "#a1a1aa" : "#fbbf24" }}>
            {selectedAdminCap.warId === parsedWarId
              ? "Selected admin cap matches the schedule war ID."
              : "Selected admin cap war ID does not match the schedule war ID."}
          </p>
        )}
        {selectedRecentConfig && (
          <p
            style={{
              marginTop: "0.5rem",
              color:
                selectedRecentConfig.warId === parsedWarId && selectedRecentConfig.systemId === parsedTargetSystemId
                  ? "#a1a1aa"
                  : "#fbbf24",
            }}
          >
            {selectedRecentConfig.warId === parsedWarId && selectedRecentConfig.systemId === parsedTargetSystemId
              ? "Selected config matches the currently entered war/system."
              : "Selected config does not match the currently entered war/system."}
          </p>
        )}

        <div style={{ marginTop: "1rem", display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={previewSchedule}
            disabled={targetKind !== 2 || !configObjectId.trim() || !adminCapId.trim()}
            style={{
              padding: "0.75rem 1rem",
              borderRadius: 8,
              border: "none",
              background: targetKind === 2 && configObjectId.trim() && adminCapId.trim() ? "#3b82f6" : "#3f3f46",
              color: "#fff",
              cursor: targetKind === 2 && configObjectId.trim() && adminCapId.trim() ? "pointer" : "not-allowed",
            }}
          >
            Preview scheduled change
          </button>
          {targetKind !== 2 && <span style={{ color: "#fbbf24" }}>War/phase scheduling needs more contract coverage than the current wrapper exposes.</span>}
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Honest gap notes</h2>
        <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
          <li>`schedule_system_rule_change` works for system configs today.</li>
          <li>Phase rotation UX is shown as a future path, not as fake authority.</li>
          <li>Cancellation exists at the lower-level module, but this portal still does not expose a safe cancel flow without known `ScheduledChange` object IDs.</li>
        </ul>
      </section>
    </div>
  );
}
