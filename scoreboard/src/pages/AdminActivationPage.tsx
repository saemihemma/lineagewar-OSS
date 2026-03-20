import { useEffect, useState } from "react";
import type { WarPhase, TribeCommand, WarActivationState } from "../lib/war-phases";
import { API_BASE_URL } from "../lib/constants";

const SESSION_KEY = "admin_auth";
const ADMIN_PASSWORD =
  String(import.meta.env.VITE_ADMIN_PASSWORD ?? "").trim() ||
  String(import.meta.env.VITE_ADMIN_UNLOCK_PASSWORD ?? "").trim();

const cardStyle: React.CSSProperties = {
  padding: "1.5rem",
  border: "1px solid #27272a",
  borderRadius: 8,
  background: "#0f0f12",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.75rem",
  borderRadius: 6,
  border: "1px solid #3f3f46",
  background: "#16161b",
  color: "#fff",
  fontFamily: "monospace",
  fontSize: "0.85rem",
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: "0.3rem",
  color: "#a1a1aa",
  fontSize: "0.8rem",
  fontFamily: "monospace",
};

const buttonStyle: React.CSSProperties = {
  padding: "0.6rem 1.5rem",
  borderRadius: 6,
  border: "1px solid #3f3f46",
  background: "#27272a",
  color: "#fff",
  fontFamily: "monospace",
  fontSize: "0.85rem",
  cursor: "pointer",
};

function getStoredPassword(): string | null {
  return sessionStorage.getItem(SESSION_KEY);
}

function PasswordGate({ onAuth }: { onAuth: (pw: string) => void }) {
  const [pw, setPw] = useState("");
  const adminConfigured = ADMIN_PASSWORD.length > 0;

  if (!adminConfigured) {
    return (
      <div style={{ color: "#a1a1aa", fontFamily: "monospace", padding: "2rem", display: "grid", gap: "0.6rem" }}>
        <div style={{ color: "#f87171" }}>Admin not configured.</div>
        <div>
          Missing admin password env. Set either <code>VITE_ADMIN_PASSWORD</code> or{" "}
          <code>VITE_ADMIN_UNLOCK_PASSWORD</code> for this score frontend deployment.
        </div>
        <div style={{ color: "#71717a" }}>
          API target: <code>{API_BASE_URL}</code>
        </div>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === ADMIN_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, pw);
      onAuth(pw);
    } else {
      alert("Wrong password.");
    }
  };

  return (
    <div style={{ maxWidth: 360, margin: "4rem auto", ...cardStyle }}>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1rem" }}>
        <label style={labelStyle}>
          Admin Password
          <input
            style={inputStyle}
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoFocus
          />
        </label>
        <button type="submit" style={buttonStyle}>
          Login
        </button>
      </form>
    </div>
  );
}

const emptyTribe = (): TribeCommand => ({ name: "", id: "", captainName: "" });

export default function AdminActivationPage() {
  const [authed, setAuthed] = useState<boolean>(!!getStoredPassword());
  const [phase, setPhase] = useState<WarPhase>("pre_tribes");
  const [tribeA, setTribeA] = useState<TribeCommand>(emptyTribe());
  const [tribeB, setTribeB] = useState<TribeCommand>(emptyTribe());
  const [activatedAt, setActivatedAt] = useState<string | null>(null);
  const [bothTribesReadyAt, setBothTribesReadyAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    fetch(`${API_BASE_URL}/api/activation`)
      .then((r) => r.json())
      .then((data: WarActivationState) => {
        setPhase(data.phase);
        setTribeA(data.tribeA ?? emptyTribe());
        setTribeB(data.tribeB ?? emptyTribe());
        setActivatedAt(data.activatedAt ?? null);
        setBothTribesReadyAt(data.bothTribesReadyAt ?? null);
      })
      .catch((err) => {
        setFeedback({ ok: false, msg: `Failed to load: ${err.message}` });
      })
      .finally(() => setLoading(false));
  }, [authed]);

  if (!authed) {
    return <PasswordGate onAuth={() => setAuthed(true)} />;
  }

  const handleSave = async () => {
    setFeedback(null);
    const password = getStoredPassword();
    if (!password) return;

    const body: Record<string, unknown> = {
      tribeAName: tribeA.name || null,
      tribeAId: tribeA.id || null,
      tribeACaptainName: tribeA.captainName || null,
      tribeBName: tribeB.name || null,
      tribeBId: tribeB.id || null,
      tribeBCaptainName: tribeB.captainName || null,
      activatedAt: activatedAt,
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/activation`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Key": password,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        setFeedback({ ok: false, msg: `Error ${res.status}: ${text}` });
        return;
      }
      const updated: WarActivationState = await res.json();
      setPhase(updated.phase);
      setActivatedAt(updated.activatedAt ?? null);
      setBothTribesReadyAt(updated.bothTribesReadyAt ?? null);
      setFeedback({ ok: true, msg: "Saved." });
    } catch (err: unknown) {
      setFeedback({ ok: false, msg: `Request failed: ${(err as Error).message}` });
    }
  };

  const tribeFields = (
    label: string,
    tribe: TribeCommand,
    setTribe: (t: TribeCommand) => void,
  ) => (
    <div style={{ ...cardStyle, display: "grid", gap: "0.75rem" }}>
      <div style={{ color: "#e4e4e7", fontFamily: "monospace", fontWeight: 600, fontSize: "0.9rem" }}>
        {label}
      </div>
      <label style={labelStyle}>
        Name
        <input
          style={inputStyle}
          value={tribe.name ?? ""}
          onChange={(e) => setTribe({ ...tribe, name: e.target.value })}
        />
      </label>
      <label style={labelStyle}>
        ID
        <input
          style={inputStyle}
          value={tribe.id ?? ""}
          onChange={(e) => setTribe({ ...tribe, id: e.target.value })}
        />
      </label>
      <label style={labelStyle}>
        Captain Name
        <input
          style={inputStyle}
          value={tribe.captainName ?? ""}
          onChange={(e) => setTribe({ ...tribe, captainName: e.target.value })}
        />
      </label>
    </div>
  );

  return (
    <div
      style={{
        maxWidth: 520,
        margin: "2rem auto",
        display: "grid",
        gap: "1.25rem",
        fontFamily: "monospace",
        color: "#fff",
        padding: "0 1rem",
      }}
    >
      <h1 style={{ fontSize: "1.1rem", margin: 0, color: "#e4e4e7" }}>
        Activation Utility (Not War Ops Admin)
      </h1>

      {loading && <div style={{ color: "#a1a1aa" }}>Loading...</div>}

      <div style={cardStyle}>
        <div style={labelStyle}>
          Phase (derived from tribe data)
          <div style={{ ...inputStyle, opacity: 0.7 }}>
            {phase}
          </div>
        </div>
      </div>

      {tribeFields("Tribe A", tribeA, setTribeA)}
      {tribeFields("Tribe B", tribeB, setTribeB)}

      {/* Activation Timestamp */}
      <div style={{ ...cardStyle, display: "grid", gap: "0.75rem" }}>
        <div style={{ color: "#e4e4e7", fontFamily: "monospace", fontWeight: 600, fontSize: "0.9rem" }}>
          Activation Timestamp
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            value={activatedAt ?? ""}
            placeholder="Not set"
            readOnly
          />
          <button
            type="button"
            style={{ ...buttonStyle, whiteSpace: "nowrap" }}
            onClick={() => setActivatedAt(new Date().toISOString())}
          >
            Set Now
          </button>
          {activatedAt && (
            <button
              type="button"
              style={{ ...buttonStyle, color: "#ef4444", borderColor: "#ef4444" }}
              onClick={() => setActivatedAt(null)}
            >
              Clear
            </button>
          )}
        </div>
        {bothTribesReadyAt && (
          <div style={{ color: "#a1a1aa", fontSize: "0.75rem" }}>
            Both tribes ready at: {new Date(bothTribesReadyAt).toLocaleString()}
          </div>
        )}
      </div>

      <button type="button" style={buttonStyle} onClick={handleSave}>
        Save
      </button>

      {feedback && (
        <div
          style={{
            padding: "0.6rem 0.75rem",
            borderRadius: 6,
            border: `1px solid ${feedback.ok ? "#22c55e" : "#ef4444"}`,
            color: feedback.ok ? "#22c55e" : "#ef4444",
            fontSize: "0.8rem",
          }}
        >
          {feedback.msg}
        </div>
      )}
    </div>
  );
}
