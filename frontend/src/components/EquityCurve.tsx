import ReactECharts from "echarts-for-react";
import { useThemeMode } from "@/store/ThemeContext";
import type { EquityPoint } from "@/types";

/** Compact line chart of recent total equity. */
export default function EquityCurve({ data, height = 240 }: { data: EquityPoint[]; height?: number }) {
  const { mode } = useThemeMode();
  const axisColor = mode === "light" ? "#82928a" : "#7d8896";
  const splitColor = mode === "light" ? "#e9f0ed" : "#1a212b";

  // Fresh, vivid cyan→emerald line — reads bright on the light teal theme.
  const lineGradient = {
    type: "linear",
    x: 0, y: 0, x2: 1, y2: 0,
    colorStops: [
      { offset: 0, color: "#06b6d4" },
      { offset: 1, color: "#10b981" },
    ],
  };

  const points = data.map((p) => [p.ts, p.total_equity]);

  const option = {
    backgroundColor: "transparent",
    animation: false,
    grid: { left: 16, right: 22, top: 16, bottom: 28, containLabel: true },
    tooltip: {
      trigger: "axis",
      valueFormatter: (v: number) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
    },
    xAxis: {
      type: "time",
      axisLine: { lineStyle: { color: splitColor } },
      axisLabel: { color: axisColor, hideOverlap: true },
    },
    yAxis: {
      type: "value",
      scale: true,
      splitLine: { lineStyle: { color: splitColor } },
      axisLabel: {
        color: axisColor,
        formatter: (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 0 }),
      },
    },
    series: [
      {
        type: "line",
        smooth: true,
        showSymbol: false,
        data: points,
        lineStyle: {
          color: lineGradient,
          width: 2.6,
          shadowColor: "rgba(16,185,129,0.35)",
          shadowBlur: 8,
          shadowOffsetY: 4,
        },
        itemStyle: { color: "#10b981" },
        areaStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(16,185,129,0.28)" },
              { offset: 0.55, color: "rgba(13,179,164,0.10)" },
              { offset: 1, color: "rgba(6,182,212,0.01)" },
            ],
          },
        },
      },
    ],
  };

  return <ReactECharts option={option} style={{ width: "100%", height }} notMerge lazyUpdate />;
}
