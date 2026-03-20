export const WAR_REGISTRY_ID = import.meta.env.VITE_WAR_REGISTRY_ID ?? "0x0";
export const LIVE_VERIFIER_SNAPSHOT_URL =
  import.meta.env.VITE_LIVE_VERIFIER_SNAPSHOT_URL ??
  import.meta.env.VITE_VERIFIER_SNAPSHOT_URL ??
  "/verifier/latest.json";
export const LIVE_VERIFIER_POLL_INTERVAL_MS = Number(
  import.meta.env.VITE_LIVE_VERIFIER_POLL_INTERVAL_MS ??
    import.meta.env.VITE_VERIFIER_POLL_INTERVAL_MS ??
    (import.meta.env.DEV ? "60000" : "15000"),
);
export const SIMULATION_VERIFIER_SNAPSHOT_URL =
  import.meta.env.VITE_SIM_VERIFIER_SNAPSHOT_URL ?? (import.meta.env.DEV ? "/verifier/live.json" : "");
export const SIMULATION_VERIFIER_POLL_INTERVAL_MS = Number(
  import.meta.env.VITE_SIM_VERIFIER_POLL_INTERVAL_MS ?? (import.meta.env.DEV ? "60000" : "0"),
);
// Backward-compatible aliases used by current war/audit pages.
export const VERIFIER_SNAPSHOT_URL = LIVE_VERIFIER_SNAPSHOT_URL;
export const VERIFIER_POLL_INTERVAL_MS = LIVE_VERIFIER_POLL_INTERVAL_MS;

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";
export const WAR_ADMIN_URL = import.meta.env.VITE_WAR_ADMIN_URL ?? "http://127.0.0.1:5173";

export const CONTROL_STATE_NEUTRAL = 0;
export const CONTROL_STATE_CONTESTED = 1;
export const CONTROL_STATE_CONTROLLED = 2;

export const TRIBE_NAMES: Record<number, string> = {
  1: "Tribe Alpha",
  2: "Tribe Bravo",
};
