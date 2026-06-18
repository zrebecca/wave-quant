import { LockOutlined, SafetyCertificateOutlined, UserOutlined } from "@ant-design/icons";
import { App as AntdApp, Button, Form, Input, Typography } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { NotAdminError, useAuth } from "@/auth";

export default function Login() {
  const { login } = useAuth();
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      await login(values.username.trim(), values.password);
      navigate("/", { replace: true });
    } catch (e) {
      if (e instanceof NotAdminError) {
        message.error("仅管理员可登录后台管理系统");
      } else {
        message.error("登录失败——请检查用户名和密码");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <div className="auth-badge">
            <SafetyCertificateOutlined />
          </div>
          <Typography.Title level={4} style={{ margin: 0, fontWeight: 700 }}>
            后台管理系统
          </Typography.Title>
          <Typography.Text type="secondary">观澜量化 · 成员管理</Typography.Text>
        </div>
        <Form layout="vertical" onFinish={onFinish} requiredMark={false} size="large">
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }]}>
            <Input prefix={<UserOutlined style={{ color: "var(--app-text-3)" }} />} autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password
              prefix={<LockOutlined style={{ color: "var(--app-text-3)" }} />}
              autoComplete="current-password"
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={loading} style={{ marginTop: 4 }}>
            登录
          </Button>
        </Form>
      </div>
    </div>
  );
}
