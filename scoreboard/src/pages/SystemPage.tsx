import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import TerminalPanel from "../components/terminal/TerminalPanel";
import TerminalRouteFrame, { TerminalRouteMessage } from "../components/terminal/TerminalRouteFrame";
import StatRow from "../components/telemetry/StatRow";
import SystemStatusPanel from "../components/system/SystemStatusPanel";
import SystemControlHistoryPanel from "../components/system/SystemControlHistoryPanel";
import SystemInfrastructurePanel from "../components/system/SystemInfrastructurePanel";
import SystemConnectionsPanel from "../components/system/SystemConnectionsPanel";
import SystemTacticalLogPanel from "../components/system/SystemTacticalLogPanel";
import { MOCK_SYSTEMS, MOCK_TRIBE_SCORES, mockEventsForSystem, mockNeighbors } from "../data/mock";
import { VERIFIER_POLL_INTERVAL_MS, VERIFIER_SNAPSHOT_URL } from "../lib/constants";
import {
  buildCurrentControlFeed,
  buildTribeColorById,
  fallbackTribeName,
  formatUtcTimestamp,
  isScoreboardPayloadUsable,
} from "../lib/public-war";
import { stateLabel } from "../lib/state-colors";
import { fetchVerifierEnvelope } from "../lib/verifier";
import {
  presentResolvedSystemName,
  useResolvedSystemNames,
} from "../lib/verifier-presentation";

const panelVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, delay: i * 0.07, ease: "easeOut" },
  }),
};

const useVerifier = VERIFIER_SNAPSHOT_URL !== "";
const useMock = !useVerifier;

function mockInfrastructure(systemId: string) {
  const sys = MOCK_SYSTEMS.find((s) => s.id === systemId);
  if (!sys) return [];
  const controller = sys.controller;

  if (sys.state === 0) return [];

  return [
    {
      label: "Storage Units",
      value: controller === 1 ? 0.72 : controller === 2 ? 0.55 : 0.15,
      count: controller === 1 ? 9 : controller === 2 ? 7 : 2,
      type: (controller === 1 ? "tribeA" : controller === 2 ? "tribeB" : "neutral") as "tribeA" | "tribeB" | "neutral",
    },
    {
      label: "Gate Assemblies",
      value: controller === 1 ? 0.4 : controller === 2 ? 0.6 : 0.1,
      count: controller === 1 ? 2 : controller === 2 ? 3 : 0,
      type: (controller === 1 ? "tribeA" : controller === 2 ? "tribeB" : "neutral") as "tribeA" | "tribeB" | "neutral",
    },
    {
      label: "Turret Arrays",
      value: sys.priority === "high" ? 0.85 : 0.35,
      count: sys.priority === "high" ? 12 : 4,
      type: (controller === 1 ? "tribeA" : controller === 2 ? "tribeB" : "neutral") as "tribeA" | "tribeB" | "neutral",
    },
  ];
}

function mockCycles(systemId: string) {
  const sys = MOCK_SYSTEMS.find((s) => s.id === systemId);
  if (!sys) return { tribeA: 0, tribeB: 0, neutral: 0 };
  if (sys.controller === 1) return { tribeA: 32, tribeB: 8, neutral: 8 };
  if (sys.controller === 2) return { tribeA: 10, tribeB: 28, neutral: 10 };
  if (sys.state === 1) return { tribeA: 18, tribeB: 18, neutral: 12 };
  return { tribeA: 0, tribeB: 0, neutral: 48 };
}

function backLink() {
  return (
    <Link
      to="/war"
      style={{
        fontFamily: "IBM Plex Mono",
        fontSize: "0.65rem",
        letterSpacing: "0.1em",
        color: "var(--text-dim)",
        textDecoration: "none",
      }}
    >
      {"<- WAR OVERVIEW"}
    </Link>
  );
}

function renderUnavailable(message: string) {
  return (
    <TerminalRouteMessage
      title="LINEAGE WAR // SYSTEM TELEMETRY"
      status="STANDBY"
      right={backLink()}
      message={message}
      messageStyle={{ textAlign: "center" }}
    />
  );
}

export default function SystemPage() {
  const { id } = useParams<{ id: string }>();
  const { data: verifierEnvelope, isLoading, error } = useQuery({
    queryKey: ["verifierEnvelope", VERIFIER_SNAPSHOT_URL],
    queryFn: () => fetchVerifierEnvelope(VERIFIER_SNAPSHOT_URL),
    enabled: useVerifier,
    refetchInterval:
      useVerifier && VERIFIER_POLL_INTERVAL_MS > 0 ? VERIFIER_POLL_INTERVAL_MS : false,
    refetchOnWindowFocus: true,
  });

  const verifierData = verifierEnvelope?.scoreboard;
  const resolvedSystemNames = useResolvedSystemNames(
    id ? [id] : [],
    verifierEnvelope?.systemDisplayConfigs ?? [],
  );

  const livePayloadReady = isScoreboardPayloadUsable(verifierData ?? undefined);
  const liveVerifierData = livePayloadReady ? verifierData : undefined;
  const rawSystem = useMock
    ? MOCK_SYSTEMS.find((entry) => entry.id === id)
    : liveVerifierData
      ? liveVerifierData.systems.find((entry) => entry.id === id)
      : undefined;
  const system =
    rawSystem && !useMock
      ? {
          ...rawSystem,
          name: presentResolvedSystemName(rawSystem.id, resolvedSystemNames).primary,
        }
      : rawSystem;

  const tribeScores = useMock ? MOCK_TRIBE_SCORES : liveVerifierData ? liveVerifierData.tribeScores.slice(0, 2) : [];
  const tribeColorById = useMemo(() => buildTribeColorById(tribeScores), [tribeScores]);
  const liveSystemFeed = useMemo(
    () => (!useMock && liveVerifierData ? buildCurrentControlFeed(liveVerifierData).filter((entry) => entry.id.startsWith(`${id}-`)) : []),
    [id, liveVerifierData],
  );
  const liveHistory = useMemo(() => {
    if (useMock || !liveVerifierData || !id) {
      return [];
    }

    const snapshots = verifierEnvelope?.snapshots ?? liveVerifierData.snapshots ?? [];
    const commitments = verifierEnvelope?.commitments ?? liveVerifierData.commitments ?? [];

    return snapshots
      .filter((snapshot) => String(snapshot.systemId) === id)
      .sort((a, b) => a.tickTimestampMs - b.tickTimestampMs)
      .map((snapshot) => ({
        snapshot,
        commitment:
          commitments.find(
            (entry) =>
              entry.systemId === snapshot.systemId &&
              entry.tickTimestampMs === snapshot.tickTimestampMs,
          ) ?? null,
      }));
  }, [id, liveVerifierData, useMock, verifierEnvelope]);

  if (!id) {
    return renderUnavailable("System route is missing an ID.");
  }

  if (!useMock && error) {
    return renderUnavailable(`Unable to load verifier feed for system "${id}".`);
  }

  if (!useMock && isLoading) {
    return renderUnavailable(`Loading verifier-backed data for system "${id}"...`);
  }

  if (!useMock && !livePayloadReady) {
    return renderUnavailable(`Verifier payload is not ready for system "${id}" yet.`);
  }

  if (!system) {
    return renderUnavailable(`System "${id}" is not present in the current ${useMock ? "mock" : "verifier"} payload.`);
  }

  const neighbors = useMock ? mockNeighbors(system.id) : [];
  const cycles = useMock
    ? mockCycles(system.id)
    : {
        tribeA: system.controller === tribeScores[0]?.id ? 1 : 0,
        tribeB: system.controller === tribeScores[1]?.id ? 1 : 0,
        neutral: system.controller === undefined ? 1 : 0,
      };
  const infrastructure = useMock ? mockInfrastructure(system.id) : [];
  const totalCycles = cycles.tribeA + cycles.tribeB + cycles.neutral;
  const controllerName =
    system.controller !== undefined
      ? tribeScores.find((tribe) => tribe.id === system.controller)?.name ?? fallbackTribeName(system.controller)
      : stateLabel(system.state);
  const systemClass =
    useMock && "priority" in system && system.priority === "high"
      ? "HIGH VALUE"
      : useMock
        ? "STANDARD"
        : "VERIFIER TRACKED";
  const lastTickDisplay = !useMock && verifierData ? formatUtcTimestamp(verifierData.lastTickMs) : "Not available";

  return (
    <TerminalRouteFrame
      title={system.name.toUpperCase()}
      meta={[
        { label: "ID", value: system.id.toUpperCase() },
        { label: "CLASS", value: systemClass },
      ]}
      status="ACTIVE"
      right={backLink()}
      bodyStyle={{
        display: "grid",
        gridTemplateRows: "minmax(0, 1fr) minmax(220px, 0.7fr)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: "1px",
          background: "var(--border-panel)",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <motion.div
          custom={0}
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          style={{ gridColumn: "1 / 3", background: "var(--bg-terminal)", minHeight: 0 }}
        >
          <TerminalPanel
            title="SYSTEM STATUS"
            accent={system.controller === tribeScores[1]?.id ? "tribeB" : system.state === 1 ? "contested" : system.state === 0 ? "neutral" : "tribeA"}
            style={{ height: "100%", minHeight: 0 }}
          >
            {useMock ? (
              <SystemStatusPanel
                system={system}
                tribeScores={tribeScores}
                tribeACycles={cycles.tribeA}
                tribeBCycles={cycles.tribeB}
                neutralCycles={cycles.neutral}
                totalCycles={totalCycles}
                tribeColorById={tribeColorById}
              />
            ) : (
              <div style={{ display: "grid", gap: "0.35rem" }}>
                <StatRow label="STATE" value={stateLabel(system.state)} valueColor="var(--text)" />
                <StatRow
                  label="CONTROLLER"
                  value={controllerName}
                  valueColor={system.controller !== undefined ? tribeColorById[system.controller] ?? "var(--text)" : "var(--text)"}
                />
                <StatRow
                  label="LAST TICK"
                  value={lastTickDisplay}
                  valueColor="var(--text-muted)"
                />
                <StatRow label="DATA SOURCE" value="Verifier scoreboard payload" valueColor="var(--mint)" />
              </div>
            )}
          </TerminalPanel>
        </motion.div>

        <motion.div
          custom={1}
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          style={{ gridRow: "1 / 3", background: "var(--bg-terminal)", minHeight: 0 }}
        >
          <TerminalPanel title="NODE CONNECTIONS" accent="default" style={{ height: "100%", minHeight: 0 }}>
            {useMock ? (
              <SystemConnectionsPanel system={system} neighbors={neighbors} tribeColorById={tribeColorById} />
            ) : (
              <div style={{ display: "grid", gap: "0.5rem", color: "var(--text-dim)", fontFamily: "IBM Plex Mono", fontSize: "0.68rem", height: "100%", minHeight: 0, overflowY: "auto" }}>
                <div>Public verifier payload does not expose inter-system topology yet.</div>
                <div>The war page still renders current system control, but this detail route avoids inventing fake neighbors.</div>
              </div>
            )}
          </TerminalPanel>
        </motion.div>

        <motion.div
          custom={2}
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          style={{ background: "var(--bg-terminal)", minHeight: 0 }}
        >
          <TerminalPanel title="CONTROL HISTORY" accent="default" style={{ height: "100%", minHeight: 0 }}>
            {useMock ? (
              <SystemControlHistoryPanel
                tribeACycles={cycles.tribeA}
                tribeBCycles={cycles.tribeB}
                neutralCycles={cycles.neutral}
                tribeAName={tribeScores[0]?.name}
                tribeBName={tribeScores[1]?.name}
              />
            ) : (
              <div style={{ display: "grid", gap: "0.4rem", fontFamily: "IBM Plex Mono", fontSize: "0.67rem", height: "100%", minHeight: 0, overflowY: "auto" }}>
                {liveHistory.length === 0 ? (
                  <div style={{ color: "var(--text-dim)" }}>No published system history yet.</div>
                ) : (
                  liveHistory.slice().reverse().map(({ snapshot, commitment }) => {
                    const priorControllerName =
                      snapshot.controllerTribeId === null
                        ? "None"
                        : tribeScores.find((tribe) => tribe.id === snapshot.controllerTribeId)?.name ??
                          fallbackTribeName(snapshot.controllerTribeId);

                    return (
                      <div
                        key={`${snapshot.systemId}-${snapshot.tickTimestampMs}`}
                        style={{ borderBottom: "1px solid var(--border-grid)", paddingBottom: "0.35rem" }}
                      >
                        <div style={{ color: "var(--text)" }}>
                          {formatUtcTimestamp(snapshot.tickTimestampMs)}
                        </div>
                        <div style={{ color: "var(--text-dim)" }}>
                          {snapshot.state} // {priorControllerName} // +{commitment?.pointsAwarded ?? 0}
                        </div>
                        <div style={{ color: "var(--yellow-dim)", wordBreak: "break-all" }}>
                          {commitment?.snapshotHash ?? "No snapshot hash published"}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </TerminalPanel>
        </motion.div>

        <motion.div
          custom={3}
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          style={{ background: "var(--bg-terminal)", minHeight: 0 }}
        >
          <TerminalPanel title="INFRASTRUCTURE" accent="default" style={{ height: "100%", minHeight: 0 }}>
            {useMock ? (
              <SystemInfrastructurePanel items={infrastructure} />
            ) : (
              <div style={{ display: "grid", gap: "0.5rem", color: "var(--text-dim)", fontFamily: "IBM Plex Mono", fontSize: "0.68rem", height: "100%", minHeight: 0, overflowY: "auto" }}>
                <div>Infrastructure breakdown is not part of the current public scoreboard contract.</div>
                <div>When verifier snapshots expose system-level explainability, this panel can switch from placeholder text to real telemetry.</div>
              </div>
            )}
          </TerminalPanel>
        </motion.div>
      </div>

      <motion.div
        custom={4}
        variants={panelVariants}
        initial="hidden"
        animate="visible"
        style={{ background: "var(--bg-terminal)", borderTop: "1px solid var(--border-panel)", minHeight: 0 }}
      >
        <TerminalPanel title={`TACTICAL LOG - ${system.name.toUpperCase()}`} accent="default" style={{ height: "100%", minHeight: 0 }}>
          <div style={{ height: "100%", minHeight: 0, overflowY: "auto" }}>
            <SystemTacticalLogPanel
              entries={useMock ? mockEventsForSystem(system.id) : liveSystemFeed}
              systemName={system.name}
            />
          </div>
        </TerminalPanel>
      </motion.div>
    </TerminalRouteFrame>
  );
}
