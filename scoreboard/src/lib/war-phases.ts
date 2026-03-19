export const VALID_PHASES = ["pre_tribes", "one_tribe_ready", "both_tribes_ready"] as const;
export type WarPhase = (typeof VALID_PHASES)[number];

export type TribeCommand = {
  name: string | null;
  id: string | null;
  captainName: string | null;
};

export type WarActivationState = {
  phase: WarPhase;
  tribeA: TribeCommand | null;
  tribeB: TribeCommand | null;
  activatedAt: string | null;
  bothTribesReadyAt: string | null;
};

export const DEFAULT_ACTIVATION: WarActivationState = {
  phase: "both_tribes_ready",
  tribeA: { name: "PEACEFUL TRADE EMPIRE", id: "98000423", captainName: "CCP Overload" },
  tribeB: { name: "WARTIME RELOADED", id: "98000430", captainName: "CCP Jotunn" },
  activatedAt: null,
  bothTribesReadyAt: null,
};

/* ---- URL slug ↔ WarPhase mapping --------------------------------- */

export const PHASE_SLUGS: Record<WarPhase, string> = {
  pre_tribes: "pre-tribes",
  one_tribe_ready: "one-tribe",
  both_tribes_ready: "both-tribes",
};

export const SLUG_TO_PHASE: Record<string, WarPhase> = Object.fromEntries(
  Object.entries(PHASE_SLUGS).map(([k, v]) => [v, k as WarPhase]),
) as Record<string, WarPhase>;
