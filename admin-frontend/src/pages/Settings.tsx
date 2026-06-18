import { MoonOutlined, SunOutlined } from "@ant-design/icons";
import { Card, Segmented, Typography } from "antd";
import { useThemeMode } from "@/ThemeContext";

export default function Settings() {
  const { mode, setMode } = useThemeMode();

  return (
    <Card title="设置" style={{ maxWidth: 760 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <Typography.Text strong>主题</Typography.Text>
          <div style={{ color: "var(--app-text-3)", fontSize: 12, marginTop: 2 }}>
            切换浅色 / 深色外观
          </div>
        </div>
        <Segmented
          value={mode}
          onChange={(v) => setMode(v as "light" | "dark")}
          options={[
            { label: "浅色", value: "light", icon: <SunOutlined /> },
            { label: "深色", value: "dark", icon: <MoonOutlined /> },
          ]}
        />
      </div>
    </Card>
  );
}
