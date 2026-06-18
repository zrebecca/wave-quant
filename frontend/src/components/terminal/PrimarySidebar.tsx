import {
  ApiOutlined,
  AppstoreOutlined,
  ExperimentOutlined,
  FileSearchOutlined,
  LineChartOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { Modal, Tooltip } from "antd";
import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useI18n } from "@/i18n";
import { SettingsContent } from "@/pages/Settings";

/** 48px primary icon navigation rail. Settings lives at the bottom as a popup dialog (AiCoin). */
export default function PrimarySidebar() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [setOpen, setSetOpen] = useState(false);
  // Draggable settings dialog: offset applied to the modal via modalRender; dragged by its title.
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const onTitleDown = (e: React.PointerEvent) => {
    drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (d) setPos({ x: d.ox + ev.clientX - d.sx, y: d.oy + ev.clientY - d.sy });
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const openSettings = () => { setPos({ x: 0, y: 0 }); setSetOpen(true); };

  const items = [
    { key: "/", icon: <span className="nav-home-logo" />, label: t("menu.dashboard") },
    { key: "/market", icon: <LineChartOutlined />, label: t("menu.market") },
    // 持仓信息已并入「行情」交易终端底部面板;独立入口移除(路由 /positions 仍保留兜底)。
    // 机器人控制(启停/诊断/紧急刹车)与「我的策略」高度重合且只是当前快照、无历史;
    // 入口移除(路由 /bot 仍保留兜底,紧急操作/诊断仍可直接访问)。
    { key: "/strategy", icon: <AppstoreOutlined />, label: t("menu.strategy") },
    { key: "/risk", icon: <ApiOutlined />, label: t("menu.risk") },
    { key: "/backtest", icon: <ExperimentOutlined />, label: t("menu.backtest") },
    { key: "/logs", icon: <FileSearchOutlined />, label: t("menu.logs") },
  ];

  return (
    <nav className="tk-nav">
      {items.map((it) => {
        const active = it.key === "/" ? location.pathname === "/" : location.pathname.startsWith(it.key);
        return (
          <Tooltip key={it.key} title={it.label} placement="right">
            <button type="button" className={`tk-nav-item${active ? " active" : ""}`} onClick={() => navigate(it.key)}>
              <span className="tk-nav-ico">{it.icon}</span>
              <span>{it.label}</span>
            </button>
          </Tooltip>
        );
      })}

      {/* Settings — pinned to the bottom, opens as a draggable dialog */}
      <Tooltip title={t("menu.settings")} placement="right">
        <button type="button" className={`tk-nav-item tk-nav-foot${setOpen ? " active" : ""}`} onClick={openSettings}>
          <span className="tk-nav-ico"><SettingOutlined /></span>
          <span>{t("menu.settings")}</span>
        </button>
      </Tooltip>

      <Modal open={setOpen} onCancel={() => setSetOpen(false)} footer={null} width={600} centered destroyOnHidden
        mask maskClosable
        title={<div className="set-drag-h" onPointerDown={onTitleDown}>{t("settings.title")}</div>}
        modalRender={(modal) => <div style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}>{modal}</div>}>
        <SettingsContent />
      </Modal>
    </nav>
  );
}
