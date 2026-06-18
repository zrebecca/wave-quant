import {
  LogoutOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Button, Dropdown, Layout, Menu, Space, Tag } from "antd";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth";

const { Header, Sider, Content } = Layout;

export default function AdminLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider width={232} theme="dark" breakpoint="lg" collapsedWidth={0}>
        <div className="brand-block">
          <div className="brand-badge">
            <SafetyCertificateOutlined />
          </div>
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>观澜量化</div>
          </div>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          style={{ borderInlineEnd: "none", background: "transparent" }}
          selectedKeys={[location.pathname === "/members" ? "/" : location.pathname]}
          items={[
            { key: "/", icon: <TeamOutlined />, label: "成员管理" },
            { key: "/settings", icon: <SettingOutlined />, label: "设置" },
          ]}
          onClick={(e) => navigate(e.key)}
        />
      </Sider>
      <Layout>
        <Header
          className="app-header"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          <div />
          {user && (
            <Dropdown
              menu={{
                items: [
                  { key: "logout", icon: <LogoutOutlined />, label: "退出登录", onClick: logout },
                ],
              }}
            >
              <Button type="text" icon={<UserOutlined />}>
                <Space size={6}>
                  {user.username}
                  <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                    管理员
                  </Tag>
                </Space>
              </Button>
            </Dropdown>
          )}
        </Header>
        <Content style={{ padding: "24px 28px" }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
