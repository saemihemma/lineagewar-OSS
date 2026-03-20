import { useEffect } from "react";
import { WAR_ADMIN_URL } from "../lib/constants";

export default function WarAdminPage() {
  useEffect(() => {
    window.location.assign(WAR_ADMIN_URL);
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "1.5rem" }}>
      <section
        style={{
          width: "100%",
          maxWidth: 640,
          border: "1px solid #27272a",
          borderRadius: 12,
          background: "#0f0f12",
          padding: "1.2rem",
          color: "#e4e4e7",
          fontFamily: "monospace",
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: "0.6rem", fontSize: "1rem" }}>Redirecting to war admin...</h1>
        <p style={{ color: "#a1a1aa", marginTop: 0 }}>
          Real war operations admin is hosted separately. If redirect does not happen, open:
        </p>
        <a href={WAR_ADMIN_URL} style={{ color: "#22c55e", wordBreak: "break-all" }}>
          {WAR_ADMIN_URL}
        </a>
      </section>
    </div>
  );
}
