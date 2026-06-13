import { ConfigProvider, theme as antdTheme } from "antd";
import zhTW from "antd/locale/zh_TW";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { FocusProvider } from "./focus/FocusContext";
import { ActiveScenarioProvider } from "./scenario/ActiveScenarioContext";
import { ThemeProvider, useTheme } from "./theme/ThemeContext";

function Themed() {
  const { dark } = useTheme();
  return (
    <ConfigProvider
      locale={zhTW}
      theme={{
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: { colorPrimary: "#1677ff" },
      }}
    >
      <BrowserRouter>
        <FocusProvider>
          <ActiveScenarioProvider>
            <App />
          </ActiveScenarioProvider>
        </FocusProvider>
      </BrowserRouter>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <Themed />
    </ThemeProvider>
  </React.StrictMode>
);
