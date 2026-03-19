import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useSpring, MotionConfig, useMotionValueEvent } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { suiClient } from "./lib/client";
import {
  WAR_REGISTRY_ID,
  VERIFIER_SNAPSHOT_URL,
  VERIFIER_POLL_INTERVAL_MS,
  CONTROL_STATE_NEUTRAL,
  CONTROL_STATE_CONTESTED,
  CONTROL_STATE_CONTROLLED,
  TRIBE_NAMES,
} from "./lib/constants";
import {
  MOCK_WAR_NAME,
  MOCK_TRIBE_SCORES,
  MOCK_SYSTEMS,
  MOCK_SCORE_OVER_TIME,
  MOCK_LAST_TICK_MS,
} from "./data/mock";
import { formatUtcTimestamp } from "./lib/public-war";
import { fetchVerifierScoreboard } from "./lib/verifier";

function useWarRegistry() {
  return useQuery({
    queryKey: ["warRegistry", WAR_REGISTRY_ID],
    queryFn: () =>
      suiClient.getObject({
        id: WAR_REGISTRY_ID,
        options: { showContent: true },
      }),
    enabled: WAR_REGISTRY_ID !== "0x0",
  });
}

function formatState(state: number): string {
  if (state === CONTROL_STATE_NEUTRAL) return "Neutral";
  if (state === CONTROL_STATE_CONTESTED) return "Contested";
  if (state === CONTROL_STATE_CONTROLLED) return "Controlled";
  return "Unknown";
}

function stateColor(state: number): string {
  if (state === CONTROL_STATE_NEUTRAL) return "var(--neutral)";
  if (state === CONTROL_STATE_CONTESTED) return "var(--contested)";
  if (state === CONTROL_STATE_CONTROLLED) return "var(--tribe-a)";
  return "var(--text-muted)";
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: (i: number) => ({
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: i * 0.05 },
  }),
  exit: { opacity: 0 },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

function ScoreValue({ value }: { value: number }) {
  const spring = useSpring(value, { stiffness: 80, damping: 30 });
  const [display, setDisplay] = useState(value);
  useMotionValueEvent(spring, "change", setDisplay);
  useEffect(() => {
    spring.set(value);
  }, [value, spring]);
  return <span>{Math.round(display).toLocaleString()}</span>;
}

const chartMargin = { top: 12, right: 12, bottom: 8, left: 8 };

export default function ScorePage() {
  const useVerifier = VERIFIER_SNAPSHOT_URL !== "";
  const useMock = !useVerifier && WAR_REGISTRY_ID === "0x0";
  const { data: registryData, isLoading, error } = useWarRegistry();
  const {
    data: verifierData,
    isLoading: isVerifierLoading,
    error: verifierError,
  } = useQuery({
    queryKey: ["verifierScoreboard", VERIFIER_SNAPSHOT_URL],
    queryFn: () => fetchVerifierScoreboard(VERIFIER_SNAPSHOT_URL),
    enabled: useVerifier,
    refetchInterval: useVerifier && VERIFIER_POLL_INTERVAL_MS > 0 ? VERIFIER_POLL_INTERVAL_MS : false,
    refetchOnWindowFocus: true,
  });

  const fields =
    registryData?.data?.content && "fields" in registryData.data.content
      ? (registryData.data.content.fields as Record<string, unknown>)
      : null;

  const warName = useMock
    ? MOCK_WAR_NAME
    : useVerifier
      ? verifierData?.warName ?? "Lineage War"
    : fields?.display_name
      ? String(fields.display_name)
      : "Lineage War";

  const defaultTribeScores = useMemo(
    () => [
      { id: 1, name: TRIBE_NAMES[1] ?? "Tribe 1", points: 0, color: "var(--tribe-a)" },
      { id: 2, name: TRIBE_NAMES[2] ?? "Tribe 2", points: 0, color: "var(--tribe-b)" },
    ],
    []
  );
  const tribeScores = useMock
    ? MOCK_TRIBE_SCORES
    : useVerifier
      ? verifierData?.tribeScores ?? defaultTribeScores
      : defaultTribeScores;

  const systems = useMock ? MOCK_SYSTEMS : useVerifier ? verifierData?.systems ?? [] : [];

  const chartSeries = useMemo(
    () =>
      useMock
        ? [
            { tribeId: 1, dataKey: "tribe1", name: MOCK_TRIBE_SCORES[0].name, color: "var(--tribe-a)" },
            { tribeId: 2, dataKey: "tribe2", name: MOCK_TRIBE_SCORES[1].name, color: "var(--tribe-b)" },
          ]
        : useVerifier
          ? verifierData?.chartSeries ?? []
          : [],
    [useMock, useVerifier, verifierData],
  );

  const tribeNameById = useMemo(
    () => Object.fromEntries(tribeScores.map((tribe) => [tribe.id, tribe.name])),
    [tribeScores],
  );

  const lastTickLabel = useMock
    ? `Last tick: ${formatUtcTimestamp(MOCK_LAST_TICK_MS, { dateStyle: "short", timeStyle: "short" })}`
    : useVerifier && verifierData
      ? `Last tick: ${formatUtcTimestamp(verifierData.lastTickMs, { dateStyle: "short", timeStyle: "short" })}`
      : "Last tick: —";

  const chartData = useMemo(
    () => (useMock ? MOCK_SCORE_OVER_TIME.slice(-48) : useVerifier ? verifierData?.chartData ?? [] : []),
    [useMock, useVerifier, verifierData],
  );

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        style={{
          minHeight: "100vh",
          background: "var(--bg-deep)",
          backgroundImage:
            "radial-gradient(ellipse 80% 50% at 50% -20%, var(--glow), transparent)",
        }}
      >
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          style={{
            padding: "1.5rem 2rem",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontFamily: "IBM Plex Mono" }}>
            {warName}
          </h1>
          <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            {lastTickLabel}
          </span>
        </motion.header>

        <main style={{ padding: "2rem", maxWidth: 1200, margin: "0 auto" }}>
          {(useMock || useVerifier) && (
            <motion.section
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              style={{
                padding: "0.75rem 1rem",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                marginBottom: "1.5rem",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "0.85rem",
              }}
            >
              {useMock ? (
                <>
                  Demo mode — using mock data. Set <code>VITE_WAR_REGISTRY_ID</code> and{" "}
                  <code>VITE_SUI_RPC</code> for live chain data.
                </>
              ) : (
                <>
                  Local live verifier feed — polling <code>{VERIFIER_SNAPSHOT_URL}</code> every{" "}
                  {Math.max(1, Math.round(VERIFIER_POLL_INTERVAL_MS / 1000))}s.
                </>
              )}
            </motion.section>
          )}

          {!useMock && !useVerifier && isLoading && (
            <p
              style={{
                textAlign: "center",
                color: "var(--text-muted)",
                padding: "3rem",
              }}
            >
              Loading…
            </p>
          )}
          {useVerifier && isVerifierLoading && (
            <p
              style={{
                textAlign: "center",
                color: "var(--text-muted)",
                padding: "3rem",
              }}
            >
              Loading verifier snapshot…
            </p>
          )}
          {!useMock && !useVerifier && error && (
            <p
              style={{
                textAlign: "center",
                color: "#f87171",
                padding: "1rem",
              }}
            >
              Error: {String(error)}
            </p>
          )}
          {useVerifier && verifierError && (
            <p
              style={{
                textAlign: "center",
                color: "#f87171",
                padding: "1rem",
              }}
            >
              Error: {String(verifierError)}
            </p>
          )}

          <motion.section
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            custom={0}
            style={{
              marginBottom: "2.5rem",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "1.5rem",
            }}
          >
            {tribeScores.map((tribe) => (
              <motion.div
                key={tribe.id}
                variants={itemVariants}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.99 }}
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "1.5rem",
                  textAlign: "center",
                  borderTop: `3px solid ${tribe.color}`,
                  cursor: "default",
                }}
              >
                <div
                  className="score-label"
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "0.85rem",
                    marginBottom: "0.25rem",
                  }}
                >
                  {tribe.name}
                </div>
                <div
                  className="score-value"
                  style={{ fontSize: "2.5rem", color: tribe.color }}
                >
                  <ScoreValue value={tribe.points} />
                </div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    marginTop: "0.25rem",
                  }}
                >
                  control points
                </div>
              </motion.div>
            ))}
          </motion.section>

          {chartData.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              style={{
                marginBottom: "2.5rem",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "1rem",
                minHeight: 280,
              }}
            >
              <h2
                style={{
                  marginBottom: "1rem",
                  fontSize: "1.1rem",
                  paddingLeft: "0.25rem",
                }}
              >
                Score over time
              </h2>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chartData} margin={chartMargin}>
                  <defs>
                    {chartSeries.map((series) => (
                      <linearGradient
                        key={`${series.dataKey}Grad`}
                        id={`${series.dataKey}Grad`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor={series.color}
                          stopOpacity={0.4}
                        />
                        <stop
                          offset="100%"
                          stopColor={series.color}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="tick"
                    stroke="var(--text-muted)"
                    tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="var(--text-muted)"
                    tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => String(v)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-mid)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      color: "var(--text)",
                    }}
                    labelStyle={{ color: "var(--text-muted)" }}
                    formatter={(value: number) => [value, ""]}
                    labelFormatter={(tick) => `Tick ${tick}`}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "0.85rem" }}
                    formatter={(label) => (
                      <span style={{ color: "var(--text)" }}>{label}</span>
                    )}
                  />
                  {chartSeries.map((series) => (
                    <Area
                      key={series.dataKey}
                      type="monotone"
                      dataKey={series.dataKey}
                      name={series.name}
                      stroke={series.color}
                      strokeWidth={2}
                      fill={`url(#${series.dataKey}Grad)`}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </motion.section>
          )}

          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.3 }}
          >
            <h2 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>
              Contested systems
            </h2>
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              custom={1}
              style={{ display: "grid", gap: "0.75rem" }}
            >
              {systems.length === 0 && !isLoading && !isVerifierLoading && (
                <motion.div
                  variants={itemVariants}
                  style={{
                    padding: "2rem",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--text-muted)",
                    textAlign: "center",
                  }}
                >
                  No systems loaded yet. Waiting for the local verifier feed.
                </motion.div>
              )}
              {systems.map((sys) => (
                <motion.div
                  key={sys.id}
                  variants={itemVariants}
                  whileHover={{ scale: 1.01 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.75rem 1rem",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{sys.name}</span>
                  <motion.span
                    style={{
                      color: stateColor(sys.state),
                      fontSize: "0.9rem",
                    }}
                    initial={false}
                    animate={{ color: stateColor(sys.state) }}
                    transition={{ duration: 0.25 }}
                  >
                    {sys.controller != null
                      ? tribeNameById[sys.controller] ??
                        TRIBE_NAMES[sys.controller] ??
                        `Tribe ${sys.controller}`
                      : formatState(sys.state)}
                  </motion.span>
                </motion.div>
              ))}
            </motion.div>
          </motion.section>

          <motion.footer
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            style={{
              marginTop: "3rem",
              paddingTop: "1.5rem",
              borderTop: "1px solid var(--border)",
              color: "var(--text-muted)",
              fontSize: "0.8rem",
              textAlign: "center",
            }}
          >
            EVE Frontier · Lineage War · Score is read from{" "}
            {useVerifier ? "the local verifier feed" : "chain"} and updates every tick.
          </motion.footer>
        </main>
      </motion.div>
    </MotionConfig>
  );
}
