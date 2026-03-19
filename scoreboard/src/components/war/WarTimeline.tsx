import { motion } from "framer-motion";
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
import type { VerifierChartSeries, VerifierChartPoint } from "../../lib/verifier";

interface WarTimelineProps {
  chartData: VerifierChartPoint[];
  chartSeries: VerifierChartSeries[];
}

const chartMargin = { top: 8, right: 8, bottom: 4, left: -8 };

export default function WarTimeline({ chartData, chartSeries }: WarTimelineProps) {
  if (chartData.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.2 }}
      style={{ height: "100%" }}
    >
      <ResponsiveContainer width="100%" height="100%">
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
                <stop offset="0%" stopColor={series.color} stopOpacity={0.55} />
                <stop offset="100%" stopColor={series.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border-grid)"
            strokeOpacity={0.5}
            vertical={false}
          />
          <XAxis
            dataKey="tick"
            stroke="transparent"
            tick={{ fill: "var(--text-dim)", fontSize: 11, fontFamily: "IBM Plex Mono" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke="transparent"
            tick={{ fill: "var(--text-dim)", fontSize: 11, fontFamily: "IBM Plex Mono" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
            width={44}
            domain={[0, (max: number) => Math.ceil(max * 1.15)]}
          />
          <Tooltip
            contentStyle={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border-panel)",
              borderRadius: 0,
              color: "var(--text)",
              fontFamily: "IBM Plex Mono",
              fontSize: 11,
            }}
            labelStyle={{ color: "var(--text-dim)", fontSize: 10 }}
            formatter={(value: number, name: string) => [value, name]}
            labelFormatter={(tick) => `TICK ${tick}`}
            cursor={{ stroke: "var(--border-panel)", strokeWidth: 1 }}
          />
          <Legend
            wrapperStyle={{ fontSize: "0.6rem", fontFamily: "IBM Plex Mono", paddingTop: "0.4rem" }}
            formatter={(label) => (
              <span style={{ color: "var(--text-muted)", letterSpacing: "0.08em" }}>
                {label.toUpperCase()}
              </span>
            )}
          />
          {chartSeries.map((series) => (
            <Area
              key={series.dataKey}
              type="monotone"
              dataKey={series.dataKey}
              name={series.name}
              stroke={series.color}
              strokeWidth={2.5}
              fill={`url(#${series.dataKey}Grad)`}
              dot={false}
              activeDot={{
                r: 4,
                stroke: series.color,
                strokeWidth: 1.5,
                fill: "var(--bg-terminal)",
              }}
              isAnimationActive={true}
              animationDuration={1200}
              animationEasing="ease-out"
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
