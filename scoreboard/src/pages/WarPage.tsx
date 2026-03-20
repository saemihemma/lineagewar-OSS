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
  LIVE_VERIFIER_POLL_INTERVAL_MS,
  LIVE_VERIFIER_SNAPSHOT_URL,
  SIMULATION_VERIFIER_POLL_INTERVAL_MS,
  SIMULATION_VERIFIER_SNAPSHOT_URL,
} from "../lib/constants";
import {
  buildHeaderMeta,
  buildSystemNameMap,
  buildTribeColorById,
  formatSource,
  isScoreboardPayloadUsable,
} from "../lib/public-war";
import { fetchVerifierEnvelope } from "../lib/verifier";
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

export type WarDataMode = "live" | "simulation";

interface WarPageProps {
  mode?: WarDataMode;
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
  const displayedSystems = useMemo(() => {
    const displayNameBySystemId = new Map(
      systemDisplayConfigs.map((entry) => [entry.systemId, entry.displayName?.trim() ?? ""]),
    );

    return rawSystems.map((system) => ({
      ...system,
      name: displayNameBySystemId.get(String(system.id)) || String(system.id),
    }));
  }, [rawSystems, systemDisplayConfigs]);
  const snapshots = livePayloadReady ? (verifierData.snapshots ?? []) : [];

  const chartData = useMemo(
    () =>
      useMock
        ? (MOCK_SCORE_OVER_TIME.slice(-48) as unknown as VerifierChartPoint[])
        : livePayloadReady
          ? verifierData.chartData
          : [],
    [livePayloadReady, verifierData],
  );
  const chartSeries = useMemo(
    () =>
      useMock ? MOCK_CHART_SERIES : livePayloadReady ? verifierData.chartSeries.slice(0, 2) : [],
    [livePayloadReady, verifierData],
  );

  const lastTickMs = useMock ? MOCK_LAST_TICK_MS : verifierData?.lastTickMs ?? Date.now();
  const tribeColorById = useMemo(() => buildTribeColorById(tribeScores), [tribeScores]);
  const systemNames = useMemo(() => buildSystemNameMap(displayedSystems), [displayedSystems]);
  const tickCount =
    typeof envelopeConfig?.tickCount === "number" ? envelopeConfig.tickCount : undefined;
  const sourceMode =
    typeof envelopeConfig?.source === "string" ? envelopeConfig.source : undefined;

  const tickRateMinutes = useMemo(() => {
    if (!useMock && verifierData?.tickRateMinutes && verifierData.tickRateMinutes > 0) {
      return verifierData.tickRateMinutes;
    }
    if (chartData.length >= 2) {
      const last = chartData[chartData.length - 1];
      const prev = chartData[chartData.length - 2];
      const diffMs = (last.timestamp as number) - (prev.timestamp as number);
      const mins = diffMs / 60000;
      return mins > 0 ? mins : undefined;
    }
    return undefined;
  }, [chartData]);

  const headerMeta = useMemo(
    () =>
      useMock
        ? [
            { label: "PHASE", value: MOCK_PHASE.name.split("—")[0].trim() },
            { label: "TICK", value: String(MOCK_PHASE.tick) },
            {
              label: "SYSTEMS",
              value: `${displayedSystems.filter((s) => s.state !== 0).length} ACTIVE`,
            },
          ]
        : buildHeaderMeta(displayedSystems, chartData, formatSource(sourceMode)),
    [chartData, displayedSystems, sourceMode],
  );

  // tribeColorById kept for potential future system map use
  void tribeColorById;

  return (
    <TerminalScreen>
      <div style={{ position: "relative", minHeight: "100dvh" }}>
      <TerminalHeader
        title={warName}
        meta={headerMeta}
        status={useMock ? "ACTIVE" : livePayloadReady && !error ? "ACTIVE" : "STANDBY"}
        right={
          useVerifier ? (
            <Link
              to="/audit"
              style={{
                fontFamily: "IBM Plex Mono",
                fontSize: "0.65rem",
                letterSpacing: "0.1em",
                color: "var(--text-dim)",
                textDecoration: "none",
              }}
            >
              VIEW AUDIT →
            </Link>
          ) : undefined
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1px",
          background: "var(--border-panel)",
        }}
      >
        {/* Row 1, col 1: Scoreboard */}
        <motion.div
          custom={0}
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          style={{ background: "var(--bg-terminal)", height: "100%" }}
        >
          <TerminalPanel accent="default" style={{ height: "100%" }}>
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

        {/* Row 1–2, col 2: Score History (spans 2 rows) */}
        <motion.div
          custom={1}
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          style={{ background: "var(--bg-terminal)", gridRow: "span 2", height: "100%" }}
        >
          <TerminalPanel title="SCORE HISTORY" accent="default" noPadBottom style={{ height: "100%" }}>
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

        {/* Row 2, col 1: Phase Status */}
        <motion.div
          custom={2}
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          style={{ background: "var(--bg-terminal)" }}
        >
          <TerminalPanel title="PHASE STATUS" accent="default">
            <PhaseStatusPanel
              lastTickMs={lastTickMs}
              systems={rawSystems}
              tribeScores={tribeScores}
              tickCount={tickCount}
              tickRateMinutes={tickRateMinutes}
              phase={useMock ? MOCK_PHASE : undefined}
              phaseStartMs={useMock ? MOCK_PHASE.startMs : chartData.length > 0 ? (chartData[0].timestamp as number) : undefined}
              phaseEndMs={useMock ? MOCK_PHASE.endMs : (typeof envelopeConfig?.phaseEndMs === "number" && envelopeConfig.phaseEndMs > 0 ? envelopeConfig.phaseEndMs : undefined)}
            />
          </TerminalPanel>
        </motion.div>

        {/* Row 3, col 1: System Control */}
        <motion.div
          custom={3}
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          style={{ background: "var(--bg-terminal)", height: "100%" }}
        >
          <TerminalPanel title="SYSTEM CONTROL" accent="default" style={{ height: "100%" }}>
            <div style={{ padding: "0.35rem" }}>
              <SystemControlPanel
                systems={displayedSystems}
                tribeScores={tribeScores}
                snapshots={snapshots}
                systemDisplayConfigs={systemDisplayConfigs}
              />
            </div>
          </TerminalPanel>
        </motion.div>

        {/* Row 3, col 2: Control Feed */}
        <motion.div
          custom={4}
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          style={{ background: "var(--bg-terminal)" }}
        >
          <TerminalPanel title="CONTROL FEED" accent="default">
            <div style={{ padding: "0.35rem" }}>
              <ControlFeed
                snapshots={snapshots.length > 0 ? snapshots : undefined}
                tribeScores={tribeScores}
                systemNames={systemNames}
                mockEntries={useMock ? MOCK_EVENTS : undefined}
              />
            </div>
          </TerminalPanel>
        </motion.div>

        {/* Demo banner — mock mode only */}
        {useMock && (
          <motion.div
            custom={5}
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            style={{
              gridColumn: "1 / -1",
              background: "rgba(242,201,76,0.04)",
              borderTop: "1px solid var(--yellow-dim)",
              padding: "0.45rem 1.25rem",
              fontFamily: "IBM Plex Mono",
              fontSize: "0.58rem",
              letterSpacing: "0.1em",
              color: "var(--yellow-dim)",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>
              DEMO MODE — mock data active. Set verifier snapshot envs to enable simulation/live feeds.
            </span>
            <span>LINEAGE WAR // TERMINAL v0.1</span>
          </motion.div>
        )}
      </div>

      {/* Subtle corpse silhouette — lower empty area only */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "40%",
          backgroundImage: "url(/corridorofsaddness.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center top",
          filter: "grayscale(1) blur(2px)",
          opacity: 0.06,
          pointerEvents: "none",
          zIndex: 0,
          maskImage: "linear-gradient(to bottom, transparent 0%, black 40%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 40%)",
        }}
      />
      </div>
    </TerminalScreen>
  );
}
