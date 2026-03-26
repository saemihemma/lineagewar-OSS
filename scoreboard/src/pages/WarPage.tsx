import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import TerminalScreen from "../components/terminal/TerminalScreen";
import TerminalHeader from "../components/terminal/TerminalHeader";
import TerminalPanel from "../components/terminal/TerminalPanel";
import WarScoreboard from "../components/war/WarScoreboard";
import WarTimeline from "../components/war/WarTimeline";
import SystemControlPanel from "../components/war/SystemControlPanel";
import PhaseStatusPanel from "../components/war/PhaseStatusPanel";
import ControlFeed from "../components/war/ControlFeed";
import {
  MOCK_WAR_NAME,
  MOCK_TRIBE_SCORES,
  MOCK_SYSTEMS,
  MOCK_SCORE_OVER_TIME,
  MOCK_LAST_TICK_MS,
  MOCK_EVENTS,
  MOCK_PHASE,
} from "../data/mock";
import {
  AIRDROP_URL,
  LIVE_VERIFIER_POLL_INTERVAL_MS,
  LIVE_VERIFIER_SNAPSHOT_URL,
  PREDICTION_MARKET_URL,
  SIMULATION_VERIFIER_POLL_INTERVAL_MS,
  SIMULATION_VERIFIER_SNAPSHOT_URL,
} from "../lib/constants";
import {
  buildHeaderMeta,
  isScoreboardPayloadUsable,
} from "../lib/public-war";
import { fetchVerifierEnvelope } from "../lib/verifier";
import {
  buildSystemNameRecord,
  presentSourceLabel,
  useResolvedSystemNames,
} from "../lib/verifier-presentation";
import type { VerifierChartPoint, VerifierChartSeries, VerifierSystemControl } from "../lib/verifier";

const MOCK_CHART_SERIES: VerifierChartSeries[] = [
  { tribeId: 1, dataKey: "tribe1", name: MOCK_TRIBE_SCORES[0].name, color: "var(--tribe-a)" },
  { tribeId: 2, dataKey: "tribe2", name: MOCK_TRIBE_SCORES[1].name, color: "var(--tribe-b)" },
];

const panelVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, delay: i * 0.08, ease: "easeOut" },
  }),
};

function renderExternalHeaderAction(label: string, href: string, variantClassName: string) {
  const className = href
    ? `terminal-header-action ${variantClassName}`
    : `terminal-header-action ${variantClassName} terminal-header-action--disabled`;

  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {label}
      </a>
    );
  }

  return (
    <span className={className} aria-disabled="true">
      {label}
    </span>
  );
}

export type WarDataMode = "live" | "simulation";
type WarLifecycle = "running" | "ended_pending_resolution" | "resolved";

interface WarPageProps {
  mode?: WarDataMode;
}

function asFiniteNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function buildPhaseLabel(phaseId?: number | null, phaseLabel?: string | null): string | null {
  if (typeof phaseLabel === "string" && phaseLabel.trim().length > 0) {
    return phaseLabel.trim();
  }
  if (typeof phaseId === "number" && Number.isFinite(phaseId)) {
    return `Phase ${phaseId}`;
  }
  return null;
}

export default function WarPage({ mode = "live" }: WarPageProps) {
  const verifierSnapshotUrl =
    mode === "simulation" ? SIMULATION_VERIFIER_SNAPSHOT_URL : LIVE_VERIFIER_SNAPSHOT_URL;
  const verifierPollIntervalMs =
    mode === "simulation" ? SIMULATION_VERIFIER_POLL_INTERVAL_MS : LIVE_VERIFIER_POLL_INTERVAL_MS;
  const useVerifier = verifierSnapshotUrl !== "";
  const useMock = !useVerifier;

  const { data: envelope, error } = useQuery({
    queryKey: ["verifierEnvelope", verifierSnapshotUrl, mode],
    queryFn: () => fetchVerifierEnvelope(verifierSnapshotUrl),
    enabled: useVerifier,
    refetchInterval:
      useVerifier && verifierPollIntervalMs > 0 ? verifierPollIntervalMs : false,
    refetchOnWindowFocus: false,
  });

  const verifierData = envelope?.scoreboard ?? undefined;
  const envelopeConfig = envelope?.config;
  const systemDisplayConfigs = envelope?.systemDisplayConfigs ?? [];
  const tickStatus = verifierData?.tickStatus ?? envelope?.tickStatus;
  const degradedReason = verifierData?.degradedReason ?? envelope?.degradedReason ?? null;

  const livePayloadReady = isScoreboardPayloadUsable(verifierData);
  const warName = useMock ? MOCK_WAR_NAME : verifierData?.warName ?? "Lineage War";
  const tribeScores = useMock
    ? MOCK_TRIBE_SCORES
    : livePayloadReady
      ? verifierData.tribeScores.slice(0, 2)
      : [];
  const rawSystems: VerifierSystemControl[] = useMock
    ? (MOCK_SYSTEMS as VerifierSystemControl[])
    : livePayloadReady
      ? verifierData.systems
      : [];
  const resolvedSystemNames = useResolvedSystemNames(
    rawSystems.map((system) => system.id),
    systemDisplayConfigs,
  );
  const displayedSystems = useMemo(() => {
    return rawSystems.map((system) => ({
      ...system,
      name: resolvedSystemNames.get(String(system.id)) || String(system.id),
    }));
  }, [rawSystems, resolvedSystemNames]);
  const snapshots = livePayloadReady ? (verifierData.snapshots ?? []) : [];

  const chartData = useMemo(
    () =>
      useMock
        ? (MOCK_SCORE_OVER_TIME.slice(-48) as unknown as VerifierChartPoint[])
        : livePayloadReady
          ? verifierData.chartData
          : [],
    [livePayloadReady, verifierData, useMock],
  );
  const chartSeries = useMemo(
    () =>
      useMock ? MOCK_CHART_SERIES : livePayloadReady ? verifierData.chartSeries.slice(0, 2) : [],
    [livePayloadReady, verifierData, useMock],
  );

  const lastTickMs = useMock ? MOCK_LAST_TICK_MS : verifierData?.lastTickMs ?? null;
  const systemNames = useMemo(() => buildSystemNameRecord(resolvedSystemNames), [resolvedSystemNames]);
  const sourceMode = envelopeConfig?.source;
  const resolvedTickCount = useMemo(() => chartData.length, [chartData]);
  const warEndMs =
    asFiniteNumber(envelopeConfig?.warEndMs) ??
    asFiniteNumber(envelope?.pending_resolution?.warEndedAtMs) ??
    asFiniteNumber(envelope?.resolution?.endedAtMs);
  const warLifecycle: WarLifecycle = useMock
    ? "running"
    : envelope?.resolution
      ? "resolved"
      : envelope?.pending_resolution || (warEndMs !== undefined && Date.now() >= warEndMs)
        ? "ended_pending_resolution"
        : "running";

  const phaseLabel = useMock
    ? undefined
    : buildPhaseLabel(envelopeConfig?.phaseId, envelopeConfig?.phaseLabel);
  const phaseStartMs = useMock ? MOCK_PHASE.startMs : asFiniteNumber(envelopeConfig?.phaseStartMs);
  const phaseEndMs = useMock ? MOCK_PHASE.endMs : asFiniteNumber(envelopeConfig?.phaseEndMs);
  const nextPhaseStartMs = useMock ? undefined : asFiniteNumber(envelopeConfig?.nextPhaseStartMs);

  const tickRateMinutes = useMemo(() => {
    if (!useMock) {
      const configured = asFiniteNumber(envelopeConfig?.tickRateMinutes);
      if (configured && configured > 0) {
        return configured;
      }
      if (verifierData?.tickRateMinutes && verifierData.tickRateMinutes > 0) {
        return verifierData.tickRateMinutes;
      }
    }
    if (chartData.length >= 2) {
      const last = chartData[chartData.length - 1];
      const prev = chartData[chartData.length - 2];
      const diffMs = Number(last.timestamp) - Number(prev.timestamp);
      const mins = diffMs / 60000;
      return mins > 0 ? mins : undefined;
    }
    return undefined;
  }, [chartData, envelopeConfig?.tickRateMinutes, useMock, verifierData?.tickRateMinutes]);

  const headerMeta = useMemo(
    () =>
      useMock
        ? [
            { label: "PHASE", value: MOCK_PHASE.name.split(/\s+\u2014\s+/u)[0].trim() },
            { label: "TICK", value: String(MOCK_PHASE.tick) },
            {
              label: "SYSTEMS",
              value: `${displayedSystems.length} TRACKED`,
            },
          ]
        : buildHeaderMeta(displayedSystems, chartData, presentSourceLabel(sourceMode)),
    [chartData, displayedSystems, sourceMode, useMock],
  );

  const headerRight = useVerifier ? (
    <div className="terminal-header-actions">
      {renderExternalHeaderAction(
        "PREDICTION MARKET",
        PREDICTION_MARKET_URL,
        "terminal-header-action--mint",
      )}
      {renderExternalHeaderAction("$SUFFER AIRDROP", AIRDROP_URL, "terminal-header-action--orange")}
      <Link
        to="/audit"
        className="terminal-header-action terminal-header-action--mint"
      >
        VIEW AUDIT
      </Link>
    </div>
  ) : undefined;

  return (
    <TerminalScreen>
      <div className="war-page-shell">
        <TerminalHeader
          title={warName}
          meta={headerMeta}
          status={
            useMock
              ? "ACTIVE"
              : warLifecycle !== "running"
                ? "ENDED"
                : tickStatus === "degraded_frozen"
                ? "DEGRADED"
                : livePayloadReady && !error
                  ? "ACTIVE"
                  : "STANDBY"
          }
          statusPosition="left"
          right={headerRight}
        />

        <div className="war-page-body">
          <div
            className="war-page-backdrop"
            style={{ backgroundImage: "url(/corridorofsaddness.jpg)" }}
          />

          <div className="war-page-grid">
            {warLifecycle === "ended_pending_resolution" && (
              <div className="war-page-banner war-page-banner--pending">
                WAR ENDED - FINAL RESOLUTION PENDING
              </div>
            )}

            {warLifecycle === "resolved" && (
              <div className="war-page-banner war-page-banner--resolved">
                WAR ENDED - FINAL RESOLUTION PUBLISHED
              </div>
            )}

            {warLifecycle === "running" && tickStatus === "degraded_frozen" && (
              <div className="war-page-banner war-page-banner--degraded">
                DEGRADED TICK: GraphQL ownership resolution failed, so the verifier carried forward
                the last known state.
                {degradedReason ? ` ${degradedReason}` : ""}
              </div>
            )}

            <motion.div
              className="war-page-panel war-page-panel--scoreboard"
              custom={0}
              variants={panelVariants}
              initial="hidden"
              animate="visible"
            >
              <TerminalPanel accent="default" className="war-page-terminal-panel">
                {tribeScores.length >= 2 ? (
                  <WarScoreboard tribeScores={tribeScores} systems={rawSystems} />
                ) : (
                  <div
                    style={{
                      color: "var(--text-dim)",
                      fontFamily: "IBM Plex Mono",
                      fontSize: "0.7rem",
                    }}
                  >
                    Waiting for verifier-backed tribe scores.
                  </div>
                )}
              </TerminalPanel>
            </motion.div>

            <motion.div
              className="war-page-panel war-page-panel--history"
              custom={1}
              variants={panelVariants}
              initial="hidden"
              animate="visible"
            >
              <TerminalPanel
                title="SCORE HISTORY"
                accent="default"
                noPadBottom
                className="war-page-terminal-panel war-page-terminal-panel--history"
              >
                {chartData.length > 0 ? (
                  <WarTimeline chartData={chartData} chartSeries={chartSeries} />
                ) : (
                  <div
                    style={{
                      color: "var(--text-dim)",
                      fontFamily: "IBM Plex Mono",
                      fontSize: "0.7rem",
                    }}
                  >
                    No score history has been published yet.
                  </div>
                )}
              </TerminalPanel>
            </motion.div>

            <motion.div
              className="war-page-panel war-page-panel--phase"
              custom={2}
              variants={panelVariants}
              initial="hidden"
              animate="visible"
            >
              <TerminalPanel
                title="PHASE STATUS"
                accent="default"
                className="war-page-terminal-panel"
              >
                <PhaseStatusPanel
                  lastTickMs={lastTickMs}
                  tribeScores={tribeScores}
                  resolvedTickCount={resolvedTickCount}
                  tickRateMinutes={tickRateMinutes}
                  phase={useMock ? MOCK_PHASE : undefined}
                  phaseLabel={phaseLabel}
                  phaseStartMs={phaseStartMs}
                  phaseEndMs={phaseEndMs}
                  nextPhaseStartMs={nextPhaseStartMs}
                  warEndMs={warEndMs}
                  warLifecycle={warLifecycle}
                />
              </TerminalPanel>
            </motion.div>

            <motion.div
              className="war-page-panel war-page-panel--systems"
              custom={3}
              variants={panelVariants}
              initial="hidden"
              animate="visible"
            >
              <TerminalPanel
                title="SYSTEM CONTROL"
                accent="default"
                className="war-page-terminal-panel"
              >
                <div className="war-page-panel__body-pad">
                  <SystemControlPanel
                    systems={displayedSystems}
                    tribeScores={tribeScores}
                    snapshots={snapshots}
                    systemDisplayConfigs={systemDisplayConfigs}
                  />
                </div>
              </TerminalPanel>
            </motion.div>

            <motion.div
              className="war-page-panel war-page-panel--feed"
              custom={4}
              variants={panelVariants}
              initial="hidden"
              animate="visible"
            >
              <TerminalPanel
                title="CONTROL FEED"
                accent="default"
                className="war-page-terminal-panel"
              >
                <div className="war-page-panel__body-pad war-page-panel__body-pad--fill">
                  <ControlFeed
                    snapshots={snapshots.length > 0 ? snapshots : undefined}
                    tribeScores={tribeScores}
                    systemNames={systemNames}
                    mockEntries={useMock ? MOCK_EVENTS : undefined}
                  />
                </div>
              </TerminalPanel>
            </motion.div>

            {useMock && (
              <motion.div
                className="war-page-footer"
                custom={5}
                variants={panelVariants}
                initial="hidden"
                animate="visible"
              >
                <span>
                  DEMO MODE - mock data active. Set verifier snapshot envs to enable
                  simulation/live feeds.
                </span>
                <span>LINEAGE WAR // TERMINAL v0.1</span>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </TerminalScreen>
  );
}
