import ReactECharts from "echarts-for-react";
import { useColors } from "@/store/PrefsContext";
import { useThemeMode } from "@/store/ThemeContext";
import type { OrderBookLevel } from "@/types";

/** Cumulative depth chart: bids (green) and asks (red) accumulating away from mid. */
export default function DepthChart({
  bids,
  asks,
  height = 300,
}: {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  height?: number;
}) {
  const { mode } = useThemeMode();
  const { up, down, upRgb, downRgb } = useColors();
  const axisColor = mode === "light" ? "#8a97a5" : "#7d8896";
  const splitColor = mode === "light" ? "#eef1f4" : "#1a212b";

  // Accumulate from best price outward, then sort ascending by price for the axis.
  let cum = 0;
  const bidPts = bids.map((l) => {
    cum += l.size;
    return [l.price, cum] as [number, number];
  });
  bidPts.reverse(); // ascending price
  cum = 0;
  const askPts = asks.map((l) => {
    cum += l.size;
    return [l.price, cum] as [number, number];
  });

  const option = {
    backgroundColor: "transparent",
    animation: false,
    grid: { left: 16, right: 16, top: 16, bottom: 28, containLabel: true },
    tooltip: {
      trigger: "axis",
      valueFormatter: (v: number) => v?.toLocaleString(undefined, { maximumFractionDigits: 4 }),
    },
    xAxis: {
      type: "value",
      scale: true,
      axisLine: { lineStyle: { color: splitColor } },
      axisLabel: { color: axisColor, formatter: (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1 }) },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: splitColor } },
      axisLabel: { color: axisColor },
    },
    series: [
      {
        name: "Bids",
        type: "line",
        step: "end",
        showSymbol: false,
        data: bidPts,
        lineStyle: { color: up, width: 1.5 },
        areaStyle: { color: `rgba(${upRgb},0.18)` },
      },
      {
        name: "Asks",
        type: "line",
        step: "start",
        showSymbol: false,
        data: askPts,
        lineStyle: { color: down, width: 1.5 },
        areaStyle: { color: `rgba(${downRgb},0.18)` },
      },
    ],
  };

  return <ReactECharts option={option} style={{ width: "100%", height }} notMerge lazyUpdate />;
}
