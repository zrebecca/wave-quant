import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { App as AntdApp, Button, Checkbox, Form, Input, Typography } from "antd";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/store/AuthContext";
import { useI18n } from "@/i18n";

export default function Login() {
  const { login } = useAuth();
  const { t } = useI18n();
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/";
  // Prefill the last successfully logged-in username (whoever it was last time), not a hard-coded default.
  // 记住密码: when opted in, the password is also stored (plaintext, localStorage) — demo-only convenience.
  const lastUsername = localStorage.getItem("lastUsername") ?? "";
  const savedPassword = localStorage.getItem("savedPassword") ?? "";

  const onFinish = async (values: { username: string; password: string; remember?: boolean }) => {
    setLoading(true);
    try {
      const username = values.username.trim();
      await login(username, values.password);
      localStorage.setItem("lastUsername", username);
      if (values.remember) localStorage.setItem("savedPassword", values.password);
      else localStorage.removeItem("savedPassword");
      navigate(from, { replace: true });
    } catch {
      message.error(t("auth.loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <div aria-label="logo" className="auth-logo" />
          <Typography.Title level={4} style={{ margin: 0, fontWeight: 700 }}>
            {t("auth.loginTitle")}
          </Typography.Title>
          <Typography.Text type="secondary">{t("auth.loginSubtitle")}</Typography.Text>
        </div>
        <Form layout="vertical" onFinish={onFinish} requiredMark={false} size="large"
          initialValues={{ username: lastUsername, password: savedPassword, remember: !!savedPassword }}>
          <Form.Item name="username" label={t("auth.username")} rules={[{ required: true }]}>
            <Input prefix={<UserOutlined style={{ color: "var(--app-text-3)" }} />} autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label={t("auth.password")} rules={[{ required: true }]}>
            <Input.Password
              prefix={<LockOutlined style={{ color: "var(--app-text-3)" }} />}
              autoComplete="current-password"
            />
          </Form.Item>
          <Form.Item name="remember" valuePropName="checked" style={{ marginBottom: 12 }}>
            <Checkbox>{t("auth.rememberPassword")}</Checkbox>
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={loading} style={{ marginTop: 4 }}>
            {t("auth.signIn")}
          </Button>
        </Form>
      </div>
    </div>
  );
}
