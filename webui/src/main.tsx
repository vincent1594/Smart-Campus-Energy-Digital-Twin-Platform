import { ConfigProvider } from "antd";
import zhTW from "antd/locale/zh_TW";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { FocusProvider } from "./focus/FocusContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhTW} theme={{ token: { colorPrimary: "#1677ff" } }}>
      <BrowserRouter>
        <FocusProvider>
          <App />
        </FocusProvider>
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>
);
