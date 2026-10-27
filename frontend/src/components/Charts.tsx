import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceDot,
} from "recharts";
import type { Point } from "../types";
import { dateLabel, formatNumber } from "../api";
import s from "../App.module.scss";

const tooltipStyle = {
  background: "#14202e",
  border: "1px solid #334253",
  borderRadius: 10,
  color: "#f0f4f8",
};
const axis = { fill: "#98a8bd", fontSize: 11 };

export function DemandChart({
  points,
  anomalies = [],
}: {
  points: Point[];
  anomalies?: { timestamp: string; actual: number }[];
}) {
  const hourlyAxis =
    points.length > 1 &&
    Date.parse(points[points.length - 1].timestamp) -
      Date.parse(points[0].timestamp) <
      86400000;
  // Null gaps remain visible; connecting them would imply measurements that do not exist.
  return (
    <div
      className={s.chart}
      role="img"
      aria-label={`Energy demand time series with ${points.length} observations and ${anomalies.length} anomalies`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={points}
          margin={{ top: 16, right: 18, bottom: 4, left: 0 }}
        >
          <defs>
            <linearGradient id="demandFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#48ddc5" stopOpacity={0.26} />
              <stop offset="100%" stopColor="#48ddc5" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="#233043"
            strokeDasharray="3 5"
            vertical={false}
          />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(value) =>
              hourlyAxis
                ? `${String(new Date(String(value)).getUTCHours()).padStart(2, "0")}:00`
                : dateLabel(String(value))
            }
            tick={axis}
            axisLine={false}
            tickLine={false}
            minTickGap={65}
          />
          <YAxis
            tick={axis}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${formatNumber(Number(v) / 1000, 1)}`}
            width={46}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(label) => new Date(String(label)).toUTCString()}
            formatter={(value) => [
              `${formatNumber(Number(value), 1)} kW`,
              "Demand",
            ]}
          />
          <Area
            type="monotone"
            dataKey="demand_kw"
            stroke="#48ddc5"
            strokeWidth={2}
            fill="url(#demandFill)"
            connectNulls={false}
            isAnimationActive={false}
          />
          {anomalies.map((point) => (
            <ReferenceDot
              key={point.timestamp}
              x={point.timestamp}
              y={point.actual}
              r={5}
              fill="#ffb665"
              stroke="#101a28"
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function ForecastChart({
  history,
  forecast,
}: {
  history: Point[];
  forecast: Point[];
}) {
  const data = [
    ...history.map((p) => ({
      timestamp: p.timestamp,
      observed: p.demand_kw,
      predicted: null as number | null,
    })),
    ...forecast.map((p) => ({
      timestamp: p.timestamp,
      observed: null as number | null,
      predicted: p.demand_kw,
    })),
  ];
  if (history.length && forecast.length)
    data[history.length - 1].predicted = history[history.length - 1].demand_kw;
  return (
    <div
      className={s.chart}
      role="img"
      aria-label="Observed energy demand followed by the statistical forecast"
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 20, right: 20, bottom: 4, left: 4 }}
        >
          <CartesianGrid
            stroke="#233043"
            strokeDasharray="3 5"
            vertical={false}
          />
          <XAxis
            dataKey="timestamp"
            tickFormatter={dateLabel}
            tick={axis}
            minTickGap={60}
            axisLine={false}
            tickLine={false}
          />
          <YAxis tick={axis} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(label) => new Date(String(label)).toUTCString()}
            formatter={(value) => `${formatNumber(Number(value), 1)} kW`}
          />
          <Line
            dataKey="observed"
            name="Observed"
            dot={false}
            stroke="#48ddc5"
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Line
            dataKey="predicted"
            name="Forecast"
            dot={false}
            stroke="#7e9fff"
            strokeWidth={2}
            strokeDasharray="6 4"
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
