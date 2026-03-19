import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ASSEMBLY_FAMILY_OPTIONS, STORAGE_REQUIREMENT_OPTIONS } from "../lib/constants";
import { useAdminPortalState } from "../lib/admin-context";
import {
  formatTimestamp,
  parseDateTimeLocalToMs,
  parseNumberList,
  shortenId,
  toDateTimeLocalValue,
  useOwnedAdminCaps,
  useRecentPublishedSystemConfigs,
} from "../lib/utils";
import type { AssemblyFamily, StorageRequirementMode } from "../lib/types";

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

function toggleFamily(selection: AssemblyFamily[], family: AssemblyFamily): AssemblyFamily[] {
  return selection.includes(family) ? selection.filter((entry) => entry !== family) : [...selection, family];
}

export default function SystemConfigEditor() {
  const navigate = useNavigate();
  const { setDraft } = useAdminPortalState();
  const ownedAdminCaps = useOwnedAdminCaps();

  const [warId, setWarId] = useState("1");
  const [systemId, setSystemId] = useState("3001");
  const [displayName, setDisplayName] = useState("Ashfall Depot");
  const [priorityClass, setPriorityClass] = useState("1");
  const [registerSystem, setRegisterSystem] = useState(true);
  const [systemEnabled, setSystemEnabled] = useState(true);
  const [version, setVersion] = useState("1");
  const [pointsPerTick, setPointsPerTick] = useState("1");
  const [tickMinutesOverride, setTickMinutesOverride] = useState("");
  const [takeMargin, setTakeMargin] = useState("1");
  const [holdMargin, setHoldMargin] = useState("1");
  const [neutralMinTotalPresence, setNeutralMinTotalPresence] = useState("1");
  const [contestedWhenTied, setContestedWhenTied] = useState(true);
  const [storageRequirementMode, setStorageRequirementMode] = useState<StorageRequirementMode>(0);
  const [minimumTotalItemCount, setMinimumTotalItemCount] = useState("0");
  const [effectiveFromLocal, setEffectiveFromLocal] = useState(toDateTimeLocalValue(Date.now()));
  const [effectiveUntilLocal, setEffectiveUntilLocal] = useState("");
  const [allowedAssemblyFamilies, setAllowedAssemblyFamilies] = useState<AssemblyFamily[]>([0]);
  const [allowedAssemblyTypeIds, setAllowedAssemblyTypeIds] = useState("");
  const [allowedStorageTypeIds, setAllowedStorageTypeIds] = useState("");
  const [requiredItemTypeIds, setRequiredItemTypeIds] = useState("");
  const [displayRuleLabel, setDisplayRuleLabel] = useState("");
  const [displayRuleDescription, setDisplayRuleDescription] = useState("");
  const [adminCapId, setAdminCapId] = useState("");
  const parsedWarId = Number(warId);
  const parsedSystemId = Number(systemId);
  const recentConfigs = useRecentPublishedSystemConfigs(
    5,
    {
      warId: Number.isFinite(parsedWarId) && parsedWarId > 0 ? parsedWarId : null,
      systemId: Number.isFinite(parsedSystemId) && parsedSystemId > 0 ? parsedSystemId : null,
    },
  );
  const selectedAdminCap = ownedAdminCaps.data?.find((cap) => cap.objectId === adminCapId) ?? null;

  useEffect(() => {
    if (!adminCapId && ownedAdminCaps.data?.length) {
      setAdminCapId(ownedAdminCaps.data[0].objectId);
    }
  }, [adminCapId, ownedAdminCaps.data]);

  const previewDraft = () => {
    setDraft({
      kind: "upsert-system-config",
      warId: Number(warId) || 0,
      systemId: Number(systemId) || 0,
      displayName: displayName.trim(),
      priorityClass: Number(priorityClass) || 0,
      registerSystem,
      systemEnabled,
      version: Number(version) || 0,
      pointsPerTick: Number(pointsPerTick) || 0,
      tickMinutesOverride: tickMinutesOverride.trim() ? Number(tickMinutesOverride) : null,
      takeMargin: Number(takeMargin) || 0,
      holdMargin: Number(holdMargin) || 0,
      neutralMinTotalPresence: Number(neutralMinTotalPresence) || 0,
      contestedWhenTied,
      storageRequirementMode,
      minimumTotalItemCount: Number(minimumTotalItemCount) || 0,
      effectiveFromMs: parseDateTimeLocalToMs(effectiveFromLocal) ?? Date.now(),
      effectiveUntilMs: parseDateTimeLocalToMs(effectiveUntilLocal),
      adminCapId: adminCapId.trim(),
      adminCapWarId: selectedAdminCap?.warId ?? null,
      ruleSet: {
        allowedAssemblyFamilies,
        allowedAssemblyTypeIds: parseNumberList(allowedAssemblyTypeIds),
        allowedStorageTypeIds: parseNumberList(allowedStorageTypeIds),
        requiredItemTypeIds: parseNumberList(requiredItemTypeIds),
      },
      displayCopy: {
        displayRuleLabel: displayRuleLabel.trim(),
        displayRuleDescription: displayRuleDescription.trim(),
      },
    });
    navigate("/preview");
  };

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <div>
        <h1 style={{ marginTop: 0 }}>System config editor</h1>
        <p style={{ color: "#a1a1aa", maxWidth: 900 }}>
          Build the exact per-system rules you want to publish on chain: points, margins, storage requirements, and the
          assembly/item filters that determine what counts as presence. Use config-only mode when the system already
          exists and you are publishing a new version rather than registering a new `WarSystem`.
        </p>
      </div>

      <section style={cardStyle}>
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
            <span>Display name</span>
            <input style={inputStyle} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <label style={labelStyle}>
            <span>Priority class</span>
            <input style={inputStyle} value={priorityClass} onChange={(event) => setPriorityClass(event.target.value)} />
          </label>
          <label style={labelStyle}>
            <span>Config version</span>
            <input style={inputStyle} value={version} onChange={(event) => setVersion(event.target.value)} />
          </label>
          <label style={labelStyle}>
            <span>Points per tick</span>
            <input style={inputStyle} value={pointsPerTick} onChange={(event) => setPointsPerTick(event.target.value)} />
          </label>
          <label style={labelStyle}>
            <span>Tick override (optional)</span>
            <input
              style={inputStyle}
              value={tickMinutesOverride}
              onChange={(event) => setTickMinutesOverride(event.target.value)}
              placeholder="Leave blank to inherit war default"
            />
          </label>
          <label style={labelStyle}>
            <span>Take margin</span>
            <input style={inputStyle} value={takeMargin} onChange={(event) => setTakeMargin(event.target.value)} />
          </label>
          <label style={labelStyle}>
            <span>Hold margin</span>
            <input style={inputStyle} value={holdMargin} onChange={(event) => setHoldMargin(event.target.value)} />
          </label>
          <label style={labelStyle}>
            <span>Neutral minimum presence</span>
            <input
              style={inputStyle}
              value={neutralMinTotalPresence}
              onChange={(event) => setNeutralMinTotalPresence(event.target.value)}
            />
          </label>
          <label style={labelStyle}>
            <span>Storage requirement mode</span>
            <select
              style={inputStyle}
              value={storageRequirementMode}
              onChange={(event) => setStorageRequirementMode(Number(event.target.value) as StorageRequirementMode)}
            >
              {STORAGE_REQUIREMENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value} - {option.label}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            <span>Minimum total item count</span>
            <input
              style={inputStyle}
              value={minimumTotalItemCount}
              onChange={(event) => setMinimumTotalItemCount(event.target.value)}
            />
          </label>
          <label style={labelStyle}>
            <span>Effective from</span>
            <input
              style={inputStyle}
              type="datetime-local"
              value={effectiveFromLocal}
              onChange={(event) => setEffectiveFromLocal(event.target.value)}
            />
          </label>
          <label style={labelStyle}>
            <span>Effective until (optional)</span>
            <input
              style={inputStyle}
              type="datetime-local"
              value={effectiveUntilLocal}
              onChange={(event) => setEffectiveUntilLocal(event.target.value)}
            />
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

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "1rem" }}>
          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input type="checkbox" checked={registerSystem} onChange={(event) => setRegisterSystem(event.target.checked)} />
            <span>Register shared `WarSystem` in this transaction</span>
          </label>
          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input type="checkbox" checked={systemEnabled} onChange={(event) => setSystemEnabled(event.target.checked)} />
            <span>System enabled in published config</span>
          </label>
          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={contestedWhenTied}
              onChange={(event) => setContestedWhenTied(event.target.checked)}
            />
            <span>Contested when tied</span>
          </label>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Rule attachments</h2>
        <p style={{ color: "#71717a" }}>
          These map to the current add-only dynamic-field flags on `SystemConfigVersion`. Removing or editing an
          existing flag is not contract-native yet, so the safe path is to publish a new config version.
        </p>

        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <div style={labelStyle}>
            <span>Allowed assembly families</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
              {ASSEMBLY_FAMILY_OPTIONS.map((option) => (
                <label key={option.value} style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={allowedAssemblyFamilies.includes(option.value)}
                    onChange={() => setAllowedAssemblyFamilies((current) => toggleFamily(current, option.value))}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>
          <label style={labelStyle}>
            <span>Allowed assembly type IDs</span>
            <input
              style={inputStyle}
              value={allowedAssemblyTypeIds}
              onChange={(event) => setAllowedAssemblyTypeIds(event.target.value)}
              placeholder="Comma-separated, e.g. 88082, 88086"
            />
          </label>
          <label style={labelStyle}>
            <span>Allowed storage type IDs</span>
            <input
              style={inputStyle}
              value={allowedStorageTypeIds}
              onChange={(event) => setAllowedStorageTypeIds(event.target.value)}
              placeholder="Comma-separated type IDs"
            />
          </label>
          <label style={labelStyle}>
            <span>Required item type IDs</span>
            <input
              style={inputStyle}
              value={requiredItemTypeIds}
              onChange={(event) => setRequiredItemTypeIds(event.target.value)}
              placeholder="Comma-separated item type IDs"
            />
          </label>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Public display copy</h2>
        <p style={{ color: "#71717a" }}>
          This is editorial/public-display only. It helps the score page explain the system rule in plain
          language, but it does not change chain-backed scoring mechanics or become hidden authority.
        </p>

        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          <label style={labelStyle}>
            <span>Display rule label</span>
            <input
              style={inputStyle}
              value={displayRuleLabel}
              onChange={(event) => setDisplayRuleLabel(event.target.value.replace(/[\r\n]+/g, " ").slice(0, 24))}
              placeholder="SMART STORAGE + ITEM"
            />
            <span style={{ color: "#71717a", fontSize: "0.8rem" }}>
              Editorial/public-display only. Max 24 chars. Empty is allowed and the score page will show `—`.
            </span>
            <span style={{ color: displayRuleLabel.length > 24 ? "#f87171" : "#71717a", fontSize: "0.8rem" }}>
              {displayRuleLabel.length}/24
            </span>
          </label>

          <label style={labelStyle}>
            <span>Display rule description</span>
            <textarea
              style={{ ...inputStyle, minHeight: 110, resize: "vertical" }}
              value={displayRuleDescription}
              onChange={(event) =>
                setDisplayRuleDescription(event.target.value.replace(/[\r\n]+/g, " ").slice(0, 160))
              }
              placeholder="Control requires an active smart storage unit containing at least one qualifying required item."
            />
            <span style={{ color: "#71717a", fontSize: "0.8rem" }}>
              Editorial/public-display only. Max 160 chars. Empty keeps the tooltip hidden.
            </span>
            <span style={{ color: displayRuleDescription.length > 160 ? "#f87171" : "#71717a", fontSize: "0.8rem" }}>
              {displayRuleDescription.length}/160
            </span>
          </label>
        </div>
      </section>

      {selectedAdminCap && (
        <p style={{ margin: 0, color: selectedAdminCap.warId === parsedWarId ? "#a1a1aa" : "#fbbf24" }}>
          {selectedAdminCap.warId === parsedWarId
            ? "Selected admin cap matches the war ID you are editing."
            : "Selected admin cap war ID does not match the war ID you are editing."}
        </p>
      )}

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Scheduling note</h2>
        <p style={{ color: "#71717a" }}>
          The current contract schedules by `config_object_id`, so forward-looking changes are a two-step flow:
          publish the shared `SystemConfigVersion` first, then schedule it on the <strong>Schedule</strong> screen.
        </p>
        {recentConfigs.isLoading && <p style={{ color: "#a1a1aa" }}>Loading recent chain-published configs…</p>}
        {recentConfigs.error && <p style={{ color: "#f87171" }}>Failed to load recent configs: {String(recentConfigs.error)}</p>}
        {!!recentConfigs.data?.length && (
          <>
            <p style={{ color: "#a1a1aa" }}>
              These `SystemConfigVersion` objects are filtered to the currently entered war/system so scheduling does not
              rely on browser-session memory or package-global guessing.
            </p>
            <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
              {recentConfigs.data.slice(0, 3).map((config) => (
                <li key={config.objectId}>
                  System {config.systemId ?? "?"}, version {config.version ?? "?"}, effective {formatTimestamp(config.effectiveFromMs)}:{" "}
                  <code>{shortenId(config.objectId, 12)}</code>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={previewDraft}
          disabled={!adminCapId.trim()}
          style={{
            padding: "0.75rem 1rem",
            borderRadius: 8,
            border: "none",
            background: adminCapId.trim() ? "#3b82f6" : "#3f3f46",
            color: "#fff",
            cursor: adminCapId.trim() ? "pointer" : "not-allowed",
          }}
        >
          Preview publish transaction
        </button>
        {!adminCapId.trim() && <span style={{ color: "#f87171" }}>Enter a `WarAdminCap` object ID first.</span>}
      </div>
    </div>
  );
}
