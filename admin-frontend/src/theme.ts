import type { ThemeConfig } from "antd";
import { theme } from "antd";

export type ThemeMode = "light" | "dark";

const FONT =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif";

const shared = {
  borderRadius: 10,
  borderRadiusLG: 14,
  fontFamily: FONT,
  fontSize: 14,
  controlHeight: 36,
  wireframe: false,
};

// Dark theme — kept in sync with the trading dashboard for a consistent look.
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
  },
  components: {
    Layout: { headerBg: "rgba(13,17,23,0.72)", siderBg: "#0c1016", bodyBg: "#0a0d12", headerHeight: 60 },
    Card: { colorBgContainer: "#141a22", paddingLG: 22, headerFontSize: 15 },
    Table: {
      colorBgContainer: "transparent",
      headerBg: "#161d27",
      headerColor: "#9aa7b4",
      borderColor: "#1d2530",
      rowHoverBg: "#1a212b",
      cellPaddingBlock: 12,
    },
    Menu: {
      darkItemBg: "transparent",
      darkItemSelectedBg: "rgba(59,130,246,0.16)",
      darkItemSelectedColor: "#7eb0ff",
      darkItemHoverBg: "rgba(255,255,255,0.05)",
      itemBorderRadius: 10,
      itemHeight: 42,
      itemMarginInline: 10,
    },
    Button: { primaryShadow: "0 4px 14px rgba(59,130,246,0.35)", fontWeight: 500 },
    Modal: { contentBg: "#141a22", headerBg: "#141a22" },
    Input: { colorBgContainer: "#10151c" },
    InputNumber: { colorBgContainer: "#10151c" },
    Select: { colorBgContainer: "#10151c" },
  },
};

// Clean light theme.
const light: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    ...shared,
    colorPrimary: "#2563eb",
    colorInfo: "#2563eb",
    colorSuccess: "#10a37f",
    colorError: "#e5484d",
    colorBgBase: "#eef1f7",
    colorBgContainer: "#ffffff",
    colorBgElevated: "#ffffff",
    colorBgLayout: "#eef1f7",
    colorBorder: "#e3e8ef",
    colorBorderSecondary: "#eef0f3",
    colorText: "#1f2733",
    colorTextSecondary: "#5b6b7b",
    boxShadow: "0 6px 20px rgba(20,30,50,0.08)",
  },
  components: {
    Layout: { headerBg: "rgba(255,255,255,0.85)", siderBg: "#eef3fb", bodyBg: "#eef1f7", headerHeight: 60 },
    Card: { colorBgContainer: "#ffffff", paddingLG: 22, headerFontSize: 15 },
    Table: { colorBgContainer: "transparent", headerBg: "#f4f7fb", rowHoverBg: "#f4f7fb", cellPaddingBlock: 12 },
    Menu: {
      itemBg: "transparent",
      itemSelectedBg: "#e2ecfd",
      itemSelectedColor: "#1d4ed8",
      itemColor: "#48566a",
      itemHoverBg: "rgba(37,99,235,0.07)",
      itemHoverColor: "#1d4ed8",
      itemBorderRadius: 10,
      itemHeight: 42,
      itemMarginInline: 10,
    },
  },
};

export const getTheme = (mode: ThemeMode): ThemeConfig => (mode === "light" ? light : dark);
