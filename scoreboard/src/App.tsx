import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

const LiveWarPage = lazy(() => import("./pages/LiveWarPage"));
const SimulationPage = lazy(() => import("./pages/SimulationPage"));
const AuditPage = lazy(() => import("./pages/AuditPage"));
const AuditTickPage = lazy(() => import("./pages/AuditTickPage"));
const SystemPage = lazy(() => import("./pages/SystemPage"));
const WarAdminPage = lazy(() => import("./pages/WarAdminPage"));
const ActiveWarPage = lazy(() => import("./pages/ActiveWarPage"));

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div style={{ minHeight: "100vh", background: "#06080b" }} />}>
        <Routes>
          <Route path="/" element={<LiveWarPage />} />
          <Route path="/war" element={<LiveWarPage />} />
          <Route path="/waradmin" element={<WarAdminPage />} />
          <Route path="/active/:phase" element={<ActiveWarPage />} />
          <Route path="/simulation" element={<SimulationPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/audit/tick/:tickTimestamp" element={<AuditTickPage />} />
          <Route path="/system/:id" element={<SystemPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
