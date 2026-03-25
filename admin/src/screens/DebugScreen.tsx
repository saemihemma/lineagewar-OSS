import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCurrentAccount, useCurrentClient } from "@mysten/dapp-kit-react";
import {
  CURRENT_ADMIN_CAP_ID,
  WORLD_API_BASE_URL,
} from "../lib/constants";
import { useAdminPortalState } from "../lib/admin-context";
import { shortenId, useAutoRegistryId, useOwnedAdminCaps, formatTimestamp, parseDateTimeLocalToMs, toDateTimeLocalValue } from "../lib/utils";
import { useQuery } from "@tanstack/react-query";

const cardStyle: React.CSSProperties = {
  padding: "1rem",
  border: "1px solid #27272a",
  borderRadius: 12,
  background: "#16161b",
};

function parseFields(content: unknown): Record<string, unknown> | null {
  if (!content || typeof content !== "object" || !("fields" in content)) return null;
  return (content as { fields?: Record<string, unknown> }).fields ?? null;
}

const TIME_PRESETS: Array<{ label: string; offsetMs: number | null }> = [
  { label: "Now", offsetMs: 0 },
  { label: "+1h", offsetMs: 60 * 60_000 },
  { label: "+12h", offsetMs: 12 * 60 * 60_000 },
  { label: "+24h", offsetMs: 24 * 60 * 60_000 },
  { label: "Custom", offsetMs: null },
];

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.65rem 0.75rem",
  borderRadius: 8,
  border: "1px solid #3f3f46",
  background: "#0f0f12",
  color: "#fff",
};

const smallBtnStyle: React.CSSProperties = {
  padding: "0.4rem 0.65rem",
  borderRadius: 6,
  border: "1px solid #3f3f46",
  background: "transparent",
  color: "#a1a1aa",
  cursor: "pointer",
  fontSize: "0.8rem",
};

export default function DebugScreen() {
  const navigate = useNavigate();
  const client = useCurrentClient();
  const account = useCurrentAccount();
  const { setDraft, selectedAdminCapId, setSelectedAdminCapId } = useAdminPortalState();
  const ownedAdminCaps = useOwnedAdminCaps();

  const [endWarPreset, setEndWarPreset] = useState<number | null>(null);
  const [endWarCustom, setEndWarCustom] = useState(toDateTimeLocalValue(Date.now()));
  const [endWarConfirmed, setEndWarConfirmed] = useState(false);
  const [cancelEndConfirmed, setCancelEndConfirmed] = useState(false);

  const [newWinMargin, setNewWinMargin] = useState("");

  const [tribeId, setTribeId] = useState("");
  const [tribeDisplayName, setTribeDisplayName] = useState("");
  const [tribeFetchStatus, setTribeFetchStatus] = useState<"idle" | "loading" | "error">("idle");

  const [resolveScoresJson, setResolveScoresJson] = useState("[]");
  const [resolveConfirmed, setResolveConfirmed] = useState(false);

  useEffect(() => {
    if (ownedAdminCaps.data?.length && !selectedAdminCapId) {
      setSelectedAdminCapId(ownedAdminCaps.data[0].objectId);
    }
  }, [ownedAdminCaps.data, selectedAdminCapId, setSelectedAdminCapId]);

  const selectedAdminCap = ownedAdminCaps.data?.find((cap) => cap.objectId === selectedAdminCapId) ?? null;
  const resolvedRegistry = useAutoRegistryId(selectedAdminCap?.warId ?? null);

  const registryQuery = useQuery({
    queryKey: ["warRegistry-debug", resolvedRegistry.registryId],
    enabled: resolvedRegistry.registryId !== "0x0",
    queryFn: async () => {
      const rpcClient = client as unknown as {
        getObject: (input: unknown) => Promise<{ data?: { content?: unknown } }>;
      };
      return rpcClient.getObject({ id: resolvedRegistry.registryId, options: { showContent: true } });
    },
  });

  const fields = parseFields(registryQuery.data?.data?.content);
  const warId = Number(fields?.war_id);
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
        <h1 style={{ marginTop: 0 }}>Debug tools</h1>
        <p style={{ color: "#a1a1aa", maxWidth: 880 }}>
          Operator tools and actions. Start wars, manage phases, pause/resume, end wars, and
          access low-level recovery and override screens.
        </p>
      </div>

      {/* Quick actions */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <Link
          to="/setup"
          style={{
            padding: "0.75rem 1.25rem",
            borderRadius: 8,
            border: "none",
            background: "#3b82f6",
            color: "#fff",
            fontWeight: 600,
            textDecoration: "none",
            fontSize: "0.95rem",
          }}
        >
          Start new war
        </Link>
        <Link
          to="/phases"
          style={{
            padding: "0.75rem 1.25rem",
            borderRadius: 8,
            border: "1px solid #3f3f46",
            background: "transparent",
            color: "#fff",
            fontWeight: 600,
            textDecoration: "none",
            fontSize: "0.95rem",
          }}
        >
          Manage phases
        </Link>
      </div>

      {/* Active war selector -- top of page, always visible */}
      <section style={{
        padding: "0.75rem 1rem",
        borderRadius: 12,
        background: "#1c1508",
        border: "2px solid #854d0e",
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        flexWrap: "wrap",
      }}>
        <span style={{ fontSize: "0.9rem", color: "#fbbf24", fontWeight: 700 }}>Active war:</span>
        <select
          value={selectedAdminCapId}
          onChange={(e) => setSelectedAdminCapId(e.target.value)}
          style={{
            padding: "0.55rem 0.75rem", borderRadius: 8, border: "1px solid #854d0e",
            background: "#0f0f12", color: "#fff", fontWeight: 600, fontSize: "0.9rem", flex: 1, minWidth: 250,
          }}
        >
          <option value="">Select admin cap</option>
          {CURRENT_ADMIN_CAP_ID && (
            <option value={CURRENT_ADMIN_CAP_ID}>
              Default cap | {shortenId(CURRENT_ADMIN_CAP_ID, 10)}
            </option>
          )}
          {(ownedAdminCaps.data ?? [])
            .filter((cap) => cap.objectId !== CURRENT_ADMIN_CAP_ID)
            .map((cap) => (
              <option key={cap.objectId} value={cap.objectId}>
                War {cap.warId ?? "?"} | {shortenId(cap.objectId, 10)}
              </option>
            ))}
        </select>
        <span style={{ fontSize: "0.8rem", color: "#a1a1aa" }}>
          All actions below apply to this war.
        </span>
      </section>

      {/* Emergency pause/resume */}
      <section style={{ ...cardStyle, borderColor: "#7f1d1d" }}>
        <h2 style={{ marginTop: 0, color: "#f87171" }}>Emergency: Pause / Resume war</h2>
        <p style={{ color: "#a1a1aa", margin: "0 0 0.75rem" }}>
          Last-resort toggle for the registry enabled flag. Does not rewrite historical snapshots or config.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={!selectedAdminCapId || !isRegistryLoaded}
            onClick={() => queueToggle("pause")}
            style={{
              padding: "0.7rem 1rem", borderRadius: 8, border: "none",
              background: "#f59e0b", color: "#111",
              cursor: selectedAdminCapId && isRegistryLoaded ? "pointer" : "not-allowed",
            }}
          >
            Pause war
          </button>
          <button
            type="button"
            disabled={!selectedAdminCapId || !isRegistryLoaded}
            onClick={() => queueToggle("resume")}
            style={{
              padding: "0.7rem 1rem", borderRadius: 8, border: "none",
              background: "#22c55e", color: "#fff",
              cursor: selectedAdminCapId && isRegistryLoaded ? "pointer" : "not-allowed",
            }}
          >
            Resume war
          </button>
        </div>
        {account && fields && selectedAdminCap && Number(fields.war_id) !== selectedAdminCap.warId && (
          <p style={{ marginTop: "0.5rem", color: "#fbbf24", fontSize: "0.8rem" }}>
            Admin cap war ID does not match registry war ID.
          </p>
        )}
      </section>

      {/* End war permanently */}
      <section style={{ ...cardStyle, borderColor: "#7f1d1d" }}>
        <h2 style={{ marginTop: 0, color: "#f87171" }}>Schedule war end</h2>
        <div style={{
          padding: "0.5rem 0.75rem",
          borderRadius: 8,
          background: "#1c1508",
          border: "1px solid #854d0e",
          marginBottom: "0.75rem",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}>
          <span style={{ fontSize: "0.85rem", color: "#fbbf24", fontWeight: 600 }}>
            Target: War {selectedAdminCap?.warId ?? "?"} | {shortenId(selectedAdminCapId ?? "", 10)}
          </span>
        </div>
        <p style={{ color: "#a1a1aa", margin: "0 0 0.75rem" }}>
          Schedule the war to end at a specific time. Scoring and config changes continue until the
          end time passes. Once reached, the war is permanently over and no further changes are
          possible. This cannot be undone.
        </p>
        <div style={{ marginBottom: "0.75rem" }}>
          <span style={{ fontSize: "0.85rem", color: "#a1a1aa" }}>War ends at</span>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.35rem", flexWrap: "wrap" }}>
            {TIME_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setEndWarPreset(preset.offsetMs)}
                style={{
                  ...smallBtnStyle,
                  background: endWarPreset === preset.offsetMs ? "#3b1818" : "transparent",
                  color: endWarPreset === preset.offsetMs ? "#fca5a5" : "#a1a1aa",
                  borderColor: endWarPreset === preset.offsetMs ? "#7f1d1d" : "#3f3f46",
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          {endWarPreset === null && (
            <label style={{ display: "grid", gap: "0.35rem", marginTop: "0.5rem", maxWidth: 300 }}>
              <span style={{ fontSize: "0.8rem", color: "#a1a1aa" }}>Custom date and time (UTC)</span>
              <input
                style={inputStyle}
                type="datetime-local"
                value={endWarCustom}
                onChange={(e) => setEndWarCustom(e.target.value)}
              />
            </label>
          )}
          {endWarPreset !== undefined && (
            <p style={{ color: "#71717a", fontSize: "0.8rem", margin: "0.5rem 0 0" }}>
              War ends: {formatTimestamp(
                endWarPreset === null
                  ? (parseDateTimeLocalToMs(endWarCustom) ?? Date.now())
                  : Date.now() + (endWarPreset ?? 0)
              )}
            </p>
          )}
        </div>
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
          <input type="checkbox" checked={endWarConfirmed} onChange={(e) => setEndWarConfirmed(e.target.checked)} />
          <span style={{ fontSize: "0.85rem", color: "#fca5a5" }}>
            I understand this schedules the end of War {warId || selectedAdminCap?.warId || "?"} and cannot be reversed
          </span>
        </label>
        <button
          type="button"
          disabled={!selectedAdminCapId || !isRegistryLoaded || !endWarConfirmed}
          onClick={() => {
            const endMs = endWarPreset === null
              ? (parseDateTimeLocalToMs(endWarCustom) ?? Date.now())
              : Date.now() + (endWarPreset ?? 0);
            setDraft({
              kind: "end-war",
              warId: Number.isFinite(warId) ? warId : (selectedAdminCap?.warId ?? 0),
              registryId: resolvedRegistry.registryId,
              adminCapId: selectedAdminCapId,
              adminCapWarId: selectedAdminCap?.warId ?? null,
              endedAtMs: endMs,
            });
            navigate("/preview");
          }}
          style={{
            padding: "0.7rem 1rem",
            borderRadius: 8,
            border: "none",
            background: endWarConfirmed && selectedAdminCapId && isRegistryLoaded ? "#dc2626" : "#3f3f46",
            color: "#fff",
            cursor: endWarConfirmed && selectedAdminCapId && isRegistryLoaded ? "pointer" : "not-allowed",
            fontWeight: 600,
          }}
        >
          Schedule war end
        </button>

        {/* Update / Cancel war end — shown when a war end is already scheduled and not resolved */}
        {(() => {
          const rawEnd = fields?.ended_at_ms != null ? Number(fields.ended_at_ms) : null;
          const hasEnd = rawEnd != null && Number.isFinite(rawEnd) && rawEnd > 0;
          const isResolved = fields?.resolved === true;
          if (!hasEnd || isResolved) return null;
          return (
            <div style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid #27272a" }}>
              <h3 style={{ marginTop: 0, color: "#fbbf24", fontSize: "0.95rem" }}>Modify scheduled end</h3>
              <p style={{ color: "#a1a1aa", fontSize: "0.85rem", margin: "0 0 0.75rem" }}>
                Current end: {formatTimestamp(rawEnd)}. You can update the time or cancel entirely.
              </p>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                <button
                  type="button"
                  disabled={!selectedAdminCapId || !isRegistryLoaded}
                  onClick={() => {
                    const endMs = endWarPreset === null
                      ? (parseDateTimeLocalToMs(endWarCustom) ?? Date.now())
                      : Date.now() + (endWarPreset ?? 0);
                    setDraft({
                      kind: "update-war-end-time",
                      warId: Number.isFinite(warId) ? warId : (selectedAdminCap?.warId ?? 0),
                      registryId: resolvedRegistry.registryId,
                      adminCapId: selectedAdminCapId,
                      adminCapWarId: selectedAdminCap?.warId ?? null,
                      newEndedAtMs: endMs,
                    });
                    navigate("/preview");
                  }}
                  style={{
                    padding: "0.7rem 1rem", borderRadius: 8, border: "none",
                    background: selectedAdminCapId && isRegistryLoaded ? "#f59e0b" : "#3f3f46",
                    color: "#111", cursor: selectedAdminCapId && isRegistryLoaded ? "pointer" : "not-allowed",
                    fontWeight: 600,
                  }}
                >
                  Update end time
                </button>
              </div>
              <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
                <input type="checkbox" checked={cancelEndConfirmed} onChange={(e) => setCancelEndConfirmed(e.target.checked)} />
                <span style={{ fontSize: "0.85rem", color: "#fca5a5" }}>
                  I understand cancelling re-activates the war
                </span>
              </label>
              <button
                type="button"
                disabled={!selectedAdminCapId || !isRegistryLoaded || !cancelEndConfirmed}
                onClick={() => {
                  setDraft({
                    kind: "cancel-war-end",
                    warId: Number.isFinite(warId) ? warId : (selectedAdminCap?.warId ?? 0),
                    registryId: resolvedRegistry.registryId,
                    adminCapId: selectedAdminCapId,
                    adminCapWarId: selectedAdminCap?.warId ?? null,
                  });
                  navigate("/preview");
                }}
                style={{
                  padding: "0.7rem 1rem", borderRadius: 8, border: "none",
                  background: cancelEndConfirmed && selectedAdminCapId && isRegistryLoaded ? "#22c55e" : "#3f3f46",
                  color: "#fff", cursor: cancelEndConfirmed && selectedAdminCapId && isRegistryLoaded ? "pointer" : "not-allowed",
                  fontWeight: 600,
                }}
              >
                Cancel scheduled end
              </button>
            </div>
          );
        })()}
      </section>


      {/* Set win margin */}
      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Set win margin</h2>
        <div style={{
          padding: "0.5rem 0.75rem", borderRadius: 8, background: "#101020",
          border: "1px solid #3f3f46", marginBottom: "0.75rem",
        }}>
          <span style={{ fontSize: "0.85rem", color: "#a1a1aa" }}>
            War {selectedAdminCap?.warId ?? "?"} | {shortenId(selectedAdminCapId ?? "", 10)}
          </span>
        </div>
        <p style={{ color: "#a1a1aa", margin: "0 0 0.75rem" }}>
          Set the minimum score gap required for a decisive victory. Changes are recorded on-chain as permanent shared objects.
        </p>
        <div style={{ display: "grid", gap: "0.65rem", maxWidth: 400 }}>
          <label style={{ display: "grid", gap: "0.25rem" }}>
            <span style={{ fontSize: "0.8rem", color: "#a1a1aa" }}>Win margin (score gap)</span>
            <input style={inputStyle} type="number" value={newWinMargin} onChange={(e) => setNewWinMargin(e.target.value)} placeholder="e.g. 10" />
          </label>
          <button
            type="button"
            disabled={!selectedAdminCapId || !isRegistryLoaded || !newWinMargin.trim()}
            onClick={() => {
              setDraft({
                kind: "set-win-margin",
                warId: Number.isFinite(warId) ? warId : (selectedAdminCap?.warId ?? 0),
                registryId: resolvedRegistry.registryId,
                adminCapId: selectedAdminCapId,
                adminCapWarId: selectedAdminCap?.warId ?? null,
                winMargin: Number(newWinMargin) || 0,
              });
              navigate("/preview");
            }}
            style={{
              padding: "0.7rem 1rem", borderRadius: 8, border: "none",
              background: selectedAdminCapId && isRegistryLoaded && newWinMargin.trim() ? "#f59e0b" : "#3f3f46",
              color: "#111", cursor: selectedAdminCapId && isRegistryLoaded && newWinMargin.trim() ? "pointer" : "not-allowed",
              fontWeight: 600,
            }}
          >
            Set win margin
          </button>
        </div>
      </section>

      {/* Register tribe */}
      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Register tribe</h2>
        <p style={{ color: "#a1a1aa", margin: "0 0 0.75rem" }}>
          Register a tribe on the WarRegistry as a dynamic field. The tribe ID must match the EVE Frontier tribe ID.
        </p>
        <div style={{ display: "grid", gap: "0.65rem", maxWidth: 400 }}>
          <label style={{ display: "grid", gap: "0.25rem" }}>
            <span style={{ fontSize: "0.8rem", color: "#a1a1aa" }}>Tribe ID</span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                style={{ ...inputStyle, flex: 1 }}
                type="number"
                value={tribeId}
                onChange={(e) => { setTribeId(e.target.value); setTribeFetchStatus("idle"); }}
                placeholder="e.g. 98000423"
              />
              <button
                type="button"
                disabled={!tribeId.trim() || tribeFetchStatus === "loading"}
                onClick={async () => {
                  const id = Number(tribeId);
                  if (!Number.isFinite(id) || id <= 0) return;
                  setTribeFetchStatus("loading");
                  try {
                    const res = await fetch(`${WORLD_API_BASE_URL.replace(/\/$/, "")}/v2/tribes/${id}`);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const data = await res.json();
                    const name = data?.name ?? data?.display_name ?? data?.tribe_name ?? "";
                    if (name) {
                      setTribeDisplayName(String(name));
                      setTribeFetchStatus("idle");
                    } else {
                      setTribeFetchStatus("error");
                    }
                  } catch {
                    setTribeFetchStatus("error");
                  }
                }}
                style={{
                  ...smallBtnStyle,
                  color: tribeFetchStatus === "loading" ? "#71717a" : "#60a5fa",
                  borderColor: "#3b82f6",
                }}
              >
                {tribeFetchStatus === "loading" ? "..." : "Fetch name"}
              </button>
            </div>
            {tribeFetchStatus === "error" && (
              <span style={{ fontSize: "0.75rem", color: "#f87171" }}>Could not fetch tribe name from World API</span>
            )}
          </label>
          <label style={{ display: "grid", gap: "0.25rem" }}>
            <span style={{ fontSize: "0.8rem", color: "#a1a1aa" }}>Display name</span>
            <input
              style={inputStyle}
              value={tribeDisplayName}
              onChange={(e) => setTribeDisplayName(e.target.value)}
              placeholder="e.g. PEACEFUL TRADE EMPIRE"
            />
          </label>
          <button
            type="button"
            disabled={!selectedAdminCapId || !isRegistryLoaded || !tribeId.trim() || !tribeDisplayName.trim()}
            onClick={() => {
              setDraft({
                kind: "register-tribe",
                warId: Number.isFinite(warId) ? warId : (selectedAdminCap?.warId ?? 0),
                registryId: resolvedRegistry.registryId,
                adminCapId: selectedAdminCapId,
                adminCapWarId: selectedAdminCap?.warId ?? null,
                tribeId: Number(tribeId) || 0,
                displayName: tribeDisplayName.trim(),
              });
              navigate("/preview");
            }}
            style={{
              padding: "0.7rem 1rem", borderRadius: 8, border: "none",
              background: selectedAdminCapId && isRegistryLoaded && tribeId.trim() && tribeDisplayName.trim() ? "#3b82f6" : "#3f3f46",
              color: "#fff",
              cursor: selectedAdminCapId && isRegistryLoaded && tribeId.trim() && tribeDisplayName.trim() ? "pointer" : "not-allowed",
              fontWeight: 600,
            }}
          >
            Register tribe
          </button>
        </div>
      </section>

      {/* Resolve war */}
      <section style={{ ...cardStyle, borderColor: "#14532d" }}>
        <h2 style={{ marginTop: 0, color: "#4ade80" }}>Resolve war</h2>
        <div style={{
          padding: "0.5rem 0.75rem", borderRadius: 8, background: "#101020",
          border: "1px solid #3f3f46", marginBottom: "0.75rem",
        }}>
          <span style={{ fontSize: "0.85rem", color: "#a1a1aa" }}>
            War {selectedAdminCap?.warId ?? "?"} | {shortenId(selectedAdminCapId ?? "", 10)}
          </span>
        </div>
        <p style={{ color: "#a1a1aa", margin: "0 0 0.75rem" }}>
          Submit final tribe scores to determine the war outcome. The contract compares the score gap against the win margin to decide victory or draw.
          This creates a permanent on-chain WarResolution object and cannot be undone.
        </p>
        <div style={{ display: "grid", gap: "0.65rem", maxWidth: 500 }}>
          <label style={{ display: "grid", gap: "0.25rem" }}>
            <span style={{ fontSize: "0.8rem", color: "#a1a1aa" }}>Tribe scores (JSON array)</span>
            <textarea
              style={{ ...inputStyle, minHeight: 80, fontFamily: "monospace", fontSize: "0.85rem" }}
              value={resolveScoresJson}
              onChange={(e) => setResolveScoresJson(e.target.value)}
              placeholder={'[{"tribeId": 1, "score": 100}, {"tribeId": 2, "score": 80}]'}
            />
          </label>
          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input type="checkbox" checked={resolveConfirmed} onChange={(e) => setResolveConfirmed(e.target.checked)} />
            <span style={{ fontSize: "0.85rem", color: "#86efac" }}>
              I understand this permanently resolves War {warId || selectedAdminCap?.warId || "?"}
            </span>
          </label>
          <button
            type="button"
            disabled={!selectedAdminCapId || !isRegistryLoaded || !resolveConfirmed}
            onClick={() => {
              let parsed: Array<{ tribeId: number; score: number }>;
              try {
                parsed = JSON.parse(resolveScoresJson);
                if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("empty");
              } catch {
                alert("Invalid JSON. Expected an array like [{tribeId: 1, score: 100}]");
                return;
              }
              setDraft({
                kind: "resolve-war",
                warId: Number.isFinite(warId) ? warId : (selectedAdminCap?.warId ?? 0),
                registryId: resolvedRegistry.registryId,
                adminCapId: selectedAdminCapId,
                adminCapWarId: selectedAdminCap?.warId ?? null,
                tribeScores: parsed,
              });
              navigate("/preview");
            }}
            style={{
              padding: "0.7rem 1rem", borderRadius: 8, border: "none",
              background: resolveConfirmed && selectedAdminCapId && isRegistryLoaded ? "#22c55e" : "#3f3f46",
              color: "#fff", cursor: resolveConfirmed && selectedAdminCapId && isRegistryLoaded ? "pointer" : "not-allowed",
              fontWeight: 600,
            }}
          >
            Resolve war
          </button>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Legacy screens</h2>
        <ul style={{ margin: 0, paddingLeft: "1.25rem", display: "grid", gap: "0.5rem" }}>
          <li>
            <Link to="/setup">Start war (raw)</Link> — low-level create/publish bootstrap operations with
            full parameter control.
          </li>
          <li>
            <Link to="/systems">System config editor</Link> — individual per-system config publishing.
            Use this when you need to submit remaining systems after a phase batch.
          </li>
          <li>
            <Link to="/schedule">Schedule screen</Link> — schedule future system config changes by
            referencing published config object IDs.
          </li>
          <li>
            <Link to="/snapshots">Snapshot submission</Link> — verifier-prepared or manual snapshot
            commit path.
          </li>
        </ul>
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Known contract gaps</h2>
        <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
          <li>Phase config exists, but active-system membership is not stored on chain yet.</li>
          <li>System rule dynamic fields are effectively add-only; this UI does not pretend they can be removed in place.</li>
          <li>Authoritative effective-rule preview still requires resolver/indexer logic, not just raw contract reads.</li>
        </ul>
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Operator note</h2>
        <p style={{ color: "#a1a1aa", marginBottom: 0 }}>
          The <strong>Phases</strong> screen is the primary operator workflow. It copies rules from the
          previous phase and lets you edit, add, or sunset systems with a single activation time. Use
          these debug screens only when you need direct object-level control or multi-step recovery.
        </p>
      </section>
    </div>
  );
}
