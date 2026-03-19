import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminPortalState } from "../lib/admin-context";
import { useOwnedAdminCaps, toDateTimeLocalValue, parseDateTimeLocalToMs, shortenId } from "../lib/utils";
import type { SourceOfTruthMode } from "../lib/types";

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

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>{children}</div>;
}

export default function WarSetupScreen() {
  const navigate = useNavigate();
  const { setDraft } = useAdminPortalState();
  const ownedAdminCaps = useOwnedAdminCaps();

  const [warId, setWarId] = useState("1");
  const [slug, setSlug] = useState("lineage-war");
  const [displayName, setDisplayName] = useState("The Lineage War");
  const [maxSupportedTribes, setMaxSupportedTribes] = useState("8");
  const sourceOfTruthMode: SourceOfTruthMode = 2;
  const [winMargin, setWinMargin] = useState("10");
  const [createdAtLocal, setCreatedAtLocal] = useState(toDateTimeLocalValue(Date.now()));

  const previewCreateWar = () => {
    const createdAtMs = parseDateTimeLocalToMs(createdAtLocal) ?? Date.now();
    setDraft({
      kind: "create-war",
      warId: Number(warId) || 0,
      slug: slug.trim(),
      displayName: displayName.trim(),
      maxSupportedTribes: Number(maxSupportedTribes) || 0,
      sourceOfTruthMode,
      createdAtMs,
      winMargin: Number(winMargin) || 0,
    });
    navigate("/preview");
  };

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <div>
        <h1 style={{ marginTop: 0 }}>War setup</h1>
        <p style={{ color: "#a1a1aa", maxWidth: 860 }}>
          Use this screen for the chain-backed bootstrap steps: create the war registry/admin cap and then publish the
          first default config version. The UI is only building wallet-signed transactions; it is not the authority.
        </p>
      </div>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Create war</h2>
        <FieldGrid>
          <label style={labelStyle}>
            <span>War ID</span>
            <input style={inputStyle} value={warId} onChange={(event) => setWarId(event.target.value)} />
          </label>
          <label style={labelStyle}>
            <span>Slug</span>
            <input style={inputStyle} value={slug} onChange={(event) => setSlug(event.target.value)} />
          </label>
          <label style={labelStyle}>
            <span>Display name</span>
            <input style={inputStyle} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <label style={labelStyle}>
            <span>Max supported tribes</span>
            <input
              style={inputStyle}
              value={maxSupportedTribes}
              onChange={(event) => setMaxSupportedTribes(event.target.value)}
            />
          </label>
          <label style={labelStyle}>
            <span>Source of truth mode</span>
            <input style={{ ...inputStyle, opacity: 0.6 }} value="Verifier required" disabled />
          </label>
          <label style={labelStyle}>
            <span>Win margin</span>
            <input
              style={inputStyle}
              type="number"
              value={winMargin}
              onChange={(event) => setWinMargin(event.target.value)}
              placeholder="e.g. 10"
            />
          </label>
          <label style={labelStyle}>
            <span>Created at</span>
            <input
              style={inputStyle}
              type="datetime-local"
              value={createdAtLocal}
              onChange={(event) => setCreatedAtLocal(event.target.value)}
            />
          </label>
        </FieldGrid>

        <div style={{ marginTop: "1rem", display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={previewCreateWar}
            style={{ padding: "0.7rem 1rem", borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff" }}
          >
            Preview create war
          </button>
          <span style={{ color: "#71717a" }}>
            `create_lineage_war` returns a `WarAdminCap`, so preview/submit transfers that cap to the connected wallet.
          </span>
        </div>

      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Wallet-owned admin caps</h2>
        <p style={{ color: "#71717a" }}>
          This is a convenience read from the connected wallet, not a registry of every admin cap on chain.
        </p>
        {ownedAdminCaps.isLoading && <p>Loading owned admin caps…</p>}
        {ownedAdminCaps.error && <p style={{ color: "#f87171" }}>Failed to load admin caps: {String(ownedAdminCaps.error)}</p>}
        {!ownedAdminCaps.isLoading && !ownedAdminCaps.data?.length && (
          <p style={{ color: "#a1a1aa" }}>No admin caps found for the connected wallet.</p>
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
    </div>
  );
}
