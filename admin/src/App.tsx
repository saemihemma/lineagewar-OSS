import { useMemo, useState } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import WarOverview from "./screens/WarOverview";
import WarSetupScreen from "./screens/WarSetupScreen";
import SystemConfigEditor from "./screens/SystemConfigEditor";
import ScheduleScreen from "./screens/ScheduleScreen";
import PreviewScreen from "./screens/PreviewScreen";
import SnapshotScreen from "./screens/SnapshotScreen";
import DebugScreen from "./screens/DebugScreen";
import PhaseManager from "./screens/PhaseManager";
import { useAdminPortalState } from "./lib/admin-context";
import { ADMIN_ALLOWLIST, ADMIN_UNLOCK_PASSWORD } from "./lib/constants";

const cardStyle: React.CSSProperties = {
  padding: "1rem",
  border: "1px solid #27272a",
  borderRadius: 12,
  background: "#16161b",
};

function Layout({ children }: { children: React.ReactNode }) {
  const { lock } = useAdminPortalState();

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          padding: "0.75rem 1.5rem",
          borderBottom: "1px solid #27272a",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <nav style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <NavLink
            to="/"
            style={({ isActive }) => ({
              color: isActive ? "#fff" : "#a1a1aa",
              textDecoration: "none",
              fontWeight: isActive ? 600 : 400,
            })}
          >
            Overview
          </NavLink>
          <NavLink
            to="/phases"
            style={({ isActive }) => ({
              color: isActive ? "#fff" : "#a1a1aa",
              textDecoration: "none",
              fontWeight: isActive ? 600 : 400,
            })}
          >
            Phases
          </NavLink>
          <NavLink
            to="/debug"
            style={({ isActive }) => ({
              color: isActive ? "#fff" : "#a1a1aa",
              textDecoration: "none",
              fontWeight: isActive ? 600 : 400,
            })}
          >
            Debug
          </NavLink>
          <NavLink
            to="/preview"
            style={({ isActive }) => ({
              color: isActive ? "#fff" : "#a1a1aa",
              textDecoration: "none",
              fontWeight: isActive ? 600 : 400,
            })}
          >
            Preview
          </NavLink>
        </nav>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {ADMIN_UNLOCK_PASSWORD ? (
            <button
              type="button"
              onClick={lock}
              style={{
                padding: "0.6rem 0.85rem",
                borderRadius: 8,
                border: "1px solid #3f3f46",
                background: "transparent",
                color: "#a1a1aa",
                cursor: "pointer",
              }}
            >
              Lock
            </button>
          ) : null}
          <ConnectButton />
        </div>
      </header>
      <main style={{ flex: 1, padding: "1.5rem" }}>{children}</main>
    </div>
  );
}

function LockedGate() {
  const { unlock, unlockError } = useAdminPortalState();
  const [password, setPassword] = useState("");

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "1.5rem" }}>
      <section style={{ ...cardStyle, width: "100%", maxWidth: 460, display: "grid", gap: "1rem" }}>
        <div>
          <h1 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Lineage War Admin</h1>
          <p style={{ color: "#a1a1aa", margin: 0 }}>
            Enter the deploy-time password to reveal admin controls. This is a hygiene gate only; the
            connected wallet and on-chain `WarAdminCap` remain the real authority.
          </p>
        </div>

        <label style={{ display: "grid", gap: "0.35rem" }}>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                unlock(password);
              }
            }}
            style={{
              padding: "0.75rem",
              borderRadius: 8,
              border: "1px solid #3f3f46",
              background: "#0f0f12",
              color: "#fff",
            }}
          />
        </label>

        {unlockError ? <p style={{ color: "#f87171", margin: 0 }}>{unlockError}</p> : null}

        <button
          type="button"
          onClick={() => unlock(password)}
          style={{
            padding: "0.75rem 1rem",
            borderRadius: 8,
            border: "none",
            background: "#22c55e",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Unlock admin UI
        </button>
      </section>
    </div>
  );
}

function WalletGate() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "1.5rem" }}>
      <section style={{ ...cardStyle, width: "100%", maxWidth: 520, display: "grid", gap: "1rem" }}>
        <div>
          <h1 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Connect admin wallet</h1>
          <p style={{ color: "#a1a1aa", margin: 0 }}>
            The UI is unlocked, but you still need to connect a wallet before any admin view is shown.
            Only allowlisted wallets should use this portal, and the connected wallet must still hold the
            relevant `WarAdminCap` before it can submit transactions.
          </p>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          <ConnectButton />
        </div>
      </section>
    </div>
  );
}

function UnauthorizedGate({ address }: { address: string }) {
  const { lock } = useAdminPortalState();

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "1.5rem" }}>
      <section style={{ ...cardStyle, width: "100%", maxWidth: 560, display: "grid", gap: "1rem" }}>
        <div>
          <h1 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Wallet not allowlisted</h1>
          <p style={{ color: "#a1a1aa", margin: 0 }}>
            This wallet is connected, but it is not on the admin allowlist for this deployment. Switch to
            an allowlisted wallet in your wallet extension, then reconnect here.
          </p>
        </div>
        <div style={{ color: "#d4d4d8" }}>
          Connected wallet: <code>{address}</code>
        </div>
        <div style={{ color: "#a1a1aa" }}>
          This allowlist is only a visibility gate. Even allowlisted wallets still need the correct
          on-chain `WarAdminCap` before any action will succeed.
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <ConnectButton />
          {ADMIN_UNLOCK_PASSWORD ? (
            <button
              type="button"
              onClick={lock}
              style={{
                padding: "0.75rem 1rem",
                borderRadius: 8,
                border: "1px solid #3f3f46",
                background: "transparent",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Lock admin UI
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const { isUnlocked } = useAdminPortalState();
  const account = useCurrentAccount();
  const connectedAddress = account?.address?.toLowerCase() ?? null;
  const isAllowlisted = useMemo(() => {
    if (!connectedAddress) {
      return false;
    }
    if (ADMIN_ALLOWLIST.length === 0) {
      return true;
    }
    return ADMIN_ALLOWLIST.includes(connectedAddress);
  }, [connectedAddress]);

  if (!isUnlocked) {
    return <LockedGate />;
  }

  if (!account?.address) {
    return <WalletGate />;
  }

  if (!isAllowlisted) {
    return <UnauthorizedGate address={account.address} />;
  }

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<WarOverview />} />
          <Route path="/setup" element={<WarSetupScreen />} />
          <Route path="/systems" element={<SystemConfigEditor />} />
          <Route path="/schedule" element={<ScheduleScreen />} />
          <Route path="/preview" element={<PreviewScreen />} />
          <Route path="/snapshots" element={<SnapshotScreen />} />
          <Route path="/phases" element={<PhaseManager />} />
          <Route path="/debug" element={<DebugScreen />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
