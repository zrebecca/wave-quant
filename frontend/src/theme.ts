import type { ThemeConfig } from "antd";
import { theme } from "antd";

export type ThemeMode = "light" | "dark";

const FONT =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif";

// Shared tokens that don't depend on light/dark.
const shared = {
  borderRadius: 10,
  borderRadiusLG: 14,
  fontFamily: FONT,
  fontSize: 14,
  controlHeight: 36,
  wireframe: false,
};

// Dark, trading-desk inspired theme — layered surfaces, soft depth, blue/teal accents.
const dark: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    ...shared,
    colorPrimary: "#3b82f6",
    colorInfo: "#3b82f6",
    colorSuccess: "#16c784",
    colorError: "#ea3943",
    colorWarning: "#f0a020",
    colorBgBase: "#0a0d12",
    colorBgContainer: "#141a22",
    colorBgElevated: "#1a212b",
    colorBgLayout: "#0a0d12",
    colorBorder: "#222b38",
    colorBorderSecondary: "#1a2027",
    colorText: "#e6edf3",
    colorTextSecondary: "#9aa7b4",
    colorTextTertiary: "#6b7785",
    boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
    boxShadowSecondary: "0 6px 16px rgba(0,0,0,0.30)",
  },
  components: {
    Layout: { headerBg: "rgba(13,17,23,0.72)", siderBg: "#0c1016", bodyBg: "#0a0d12", headerHeight: 60 },
    Card: { colorBgContainer: "#141a22", paddingLG: 22, headerFontSize: 15 },
    Table: {
      colorBgContainer: "transparent",
      headerBg: "#161d27",
      headerColor: "#9aa7b4",
      headerSplitColor: "transparent",
      borderColor: "#1d2530",
      rowHoverBg: "#1a212b",
      cellPaddingBlock: 12,
    },
    Menu: {
      darkItemBg: "transparent",
      darkSubMenuItemBg: "transparent",
      darkItemSelectedBg: "rgba(59,130,246,0.16)",
      darkItemSelectedColor: "#7eb0ff",
      darkItemHoverBg: "rgba(255,255,255,0.05)",
      itemBorderRadius: 10,
      itemHeight: 42,
      itemMarginInline: 10,
    },
    Button: { primaryShadow: "0 4px 14px rgba(59,130,246,0.35)", fontWeight: 500 },
    Statistic: { titleFontSize: 13, contentFontSize: 26 },
    Segmented: { itemSelectedBg: "#2a3340", borderRadius: 8, trackBg: "#10151c" },
    Tag: { borderRadiusSM: 6 },
    Modal: { contentBg: "#141a22", headerBg: "#141a22" },
    Input: { colorBgContainer: "#10151c" },
    InputNumber: { colorBgContainer: "#10151c" },
    Select: { colorBgContainer: "#10151c" },
  },
};

// Clean light theme — airy surfaces, soft shadows.
const light: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    ...shared,
    colorPrimary: "#2563eb",
    colorInfo: "#2563eb",
    colorSuccess: "#10a37f",
    colorError: "#e5484d",
    colorBgBase: "#f4f6f9",
    colorBgContainer: "#ffffff",
    colorBgElevated: "#ffffff",
    colorBgLayout: "#f4f6f9",
    colorBorder: "#e6e8eb",
    colorBorderSecondary: "#eef0f3",
    colorText: "#1f2733",
    colorTextSecondary: "#5b6b7b",
    boxShadow: "0 6px 20px rgba(20,30,50,0.08)",
  },
  components: {
    Layout: { headerBg: "rgba(255,255,255,0.8)", siderBg: "#ffffff", bodyBg: "#f4f6f9", headerHeight: 60 },
    Card: { colorBgContainer: "#ffffff", paddingLG: 22, headerFontSize: 15 },
    Table: { colorBgContainer: "transparent", headerBg: "#f6f8fb", rowHoverBg: "#f6f8fb", cellPaddingBlock: 12 },
    Menu: {
      itemSelectedBg: "#eaf1fe",
      itemSelectedColor: "#2563eb",
      itemBorderRadius: 10,
      itemHeight: 42,
      itemMarginInline: 10,
    },
    Statistic: { titleFontSize: 13, contentFontSize: 26 },
  },
};

export const getTheme = (mode: ThemeMode): ThemeConfig => (mode === "light" ? light : dark);

export const UP = "#16c784"; // green
export const DOWN = "#ea3943"; // red
