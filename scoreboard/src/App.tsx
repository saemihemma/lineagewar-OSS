import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

const WaitingPage = lazy(() => import("./pages/WaitingPage"));
const LiveWarPage = lazy(() => import("./pages/LiveWarPage"));
const SimulationPage = lazy(() => import("./pages/SimulationPage"));
const AuditPage = lazy(() => import("./pages/AuditPage"));
const AuditTickPage = lazy(() => import("./pages/AuditTickPage"));
const SystemPage = lazy(() => import("./pages/SystemPage"));
const AdminActivationPage = lazy(() => import("./pages/AdminActivationPage"));
const WarAdminPage = lazy(() => import("./pages/WarAdminPage"));
const ActiveWarPage = lazy(() => import("./pages/ActiveWarPage"));
const SHOW_WAR_ROUTES =
  import.meta.env.DEV || String(import.meta.env.VITE_ENABLE_WAR_PAGE ?? "0") === "1";
const SHOW_SIMULATION_ROUTES =
  import.meta.env.DEV || String(import.meta.env.VITE_ENABLE_SIMULATION_PAGE ?? "0") === "1";

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div style={{ minHeight: "100vh", background: "#06080b" }} />}>
        <Routes>
          <Route path="/" element={<Navigate to="/active/both-tribes" replace />} />
          <Route path="/commencing" element={<WaitingPage />} />
          <Route path="/active/:phase" element={<ActiveWarPage />} />
          {SHOW_WAR_ROUTES && (
            <>
              <Route path="/waradmin" element={<WarAdminPage />} />
              <Route path="/activation-admin" element={<AdminActivationPage />} />
              <Route path="/admin" element={<Navigate to="/activation-admin" replace />} />
            </>
          )}
          {SHOW_SIMULATION_ROUTES && <Route path="/simulation" element={<SimulationPage />} />}
          {SHOW_WAR_ROUTES && (
            <>
              <Route path="/war" element={<LiveWarPage />} />
              <Route path="/audit" element={<AuditPage />} />
              <Route path="/audit/tick/:tickTimestamp" element={<AuditTickPage />} />
              <Route path="/system/:id" element={<SystemPage />} />
            </>
          )}
          <Route path="*" element={<Navigate to="/active/both-tribes" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
