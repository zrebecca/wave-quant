import { BulbOutlined, LogoutOutlined, MoonOutlined, UserOutlined } from "@ant-design/icons";
import { Avatar, Dropdown, Tooltip } from "antd";
import HeaderMotto from "@/components/terminal/HeaderMotto";
import { useI18n } from "@/i18n";
import { useAuth } from "@/store/AuthContext";
import { useThemeMode } from "@/store/ThemeContext";
import { useWs } from "@/store/WsContext";

/** 30px global system bar (AiCoin-style): brand · status · theme · user. */
export default function GlobalHeader() {
  const { t } = useI18n();
  const { mode, setMode } = useThemeMode();
  const { user, logout } = useAuth();
  const { connected } = useWs();

  return (
    <div className="tk-header">
      <HeaderMotto />
      <div style={{ flex: 1 }} />

      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: connected ? "#16c784" : "#ea3943" }}>
        <span className="tk-hdr-dot" style={{ background: connected ? "#16c784" : "#ea3943" }} />
        {connected ? t("conn.allOk") : t("conn.issue")}
      </span>

      <Tooltip title={mode === "dark" ? t("settings.light") : t("settings.dark")}>
        <button className="tk-icon-btn" onClick={() => setMode(mode === "dark" ? "light" : "dark")}>
          {mode === "dark" ? <BulbOutlined /> : <MoonOutlined />}
        </button>
      </Tooltip>

      {user && (
        <Dropdown trigger={["click"]} placement="bottomRight"
          menu={{ items: [{ key: "logout", icon: <LogoutOutlined />, label: t("auth.logout"), onClick: logout }] }}>
          <button className="tk-icon-btn tk-avatar-btn" aria-label={user.username}>
            <Avatar size={24} icon={<UserOutlined />} />
          </button>
        </Dropdown>
      )}
    </div>
  );
}
