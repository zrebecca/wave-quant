import { ConfigProvider, App as AntdApp } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import zhTW from "antd/locale/zh_TW";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { I18nProvider } from "./i18n";
import { AuthProvider } from "./store/AuthContext";
import { PrefsProvider } from "./store/PrefsContext";
import PrefsSync from "./store/PrefsSync";
import { ThemeProvider } from "./store/ThemeContext";
import { WsProvider } from "./store/WsContext";
import { getTheme } from "./theme";
import "./index.css";

const antdLocale = (lang: string) => (lang === "zh" ? zhCN : lang === "zh-TW" ? zhTW : enUS);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      {(lang) => (
        <ThemeProvider>
          {(mode) => (
            <ConfigProvider theme={getTheme(mode)} locale={antdLocale(lang)}>
              <AntdApp notification={{ maxCount: 3, placement: "topRight" }} message={{ maxCount: 3 }}>
                <BrowserRouter>
                  <AuthProvider>
                    <PrefsProvider>
                      <PrefsSync />
                      <WsProvider>
                        <App />
                      </WsProvider>
                    </PrefsProvider>
                  </AuthProvider>
                </BrowserRouter>
              </AntdApp>
            </ConfigProvider>
          )}
        </ThemeProvider>
      )}
    </I18nProvider>
  </React.StrictMode>
);
