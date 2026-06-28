import {
  AlertOutlined, AppstoreOutlined, BarChartOutlined, DashboardOutlined,
  DownOutlined, EnvironmentOutlined, FileTextOutlined, FundProjectionScreenOutlined,
  HomeOutlined, LineChartOutlined, SafetyCertificateOutlined, ThunderboltOutlined, UserOutlined,
} from "@ant-design/icons";
import { Layout, Menu, Popover, Space, message } from "antd";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { api } from "../api/client";
import AccountPanel from "./AccountPanel";

const { Header, Content } = Layout;

const topNav = [
  { key: "/", label: "校園總覽" },
  { key: "/assets", label: "設備查詢" },
  { key: "/scenario", label: "規劃模擬" },
  { key: "/demand", label: "能源管理" },
  { key: "/history", label: "歷史趨勢" },
  { key: "/alarms", label: "告警紀錄" },
  { key: "/report", label: "報表匯出" },
  { key: "/verify", label: "驗證中心" },
];

const topIcon: Record<string, ReactNode> = {
  "/": <DashboardOutlined />, "/map": <EnvironmentOutlined />, "/buildings": <HomeOutlined />,
  "/assets": <AppstoreOutlined />, "/scenario": <FundProjectionScreenOutlined />,
  "/demand": <ThunderboltOutlined />, "/eui": <BarChartOutlined />,
  "/history": <LineChartOutlined />, "/alarms": <AlertOutlined />, "/report": <FileTextOutlined />,
  "/verify": <SafetyCertificateOutlined />,
};

export default function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const topSelected = topNav.find((i) => i.key === pathname)?.key ?? "/";

  // 冷啟動提示:後端閒置會休眠,首次喚醒約 30–60 秒。慢於 3.5s 才顯示「喚醒中」提示,回應即消。
  useEffect(() => {
    let done = false;
    let hide: (() => void) | undefined;
    const t = setTimeout(() => {
      if (!done) hide = message.loading("伺服器喚醒中,免費方案首次開啟約需 30–60 秒…", 0);
    }, 3500);
    api.health().catch(() => undefined).finally(() => { done = true; clearTimeout(t); hide?.(); });
  }, []);

  return (
    <Layout style={{ height: "100vh" }}>
      <Header style={{ background: "linear-gradient(180deg, #002235 0%, #001529 100%)", paddingInline: 20, height: 44, lineHeight: "44px", display: "flex", alignItems: "center", gap: 53,
        boxShadow: "inset 0 -1px 0 rgba(54,209,255,0.18), 0 2px 10px rgba(0,0,0,0.20)" }}>
        <img src="/stust-logo.png" alt="STUST" title="回首頁(重新整理)" onClick={() => { window.location.href = "/"; }}
          style={{ height: 26, display: "block", cursor: "pointer" }} />
        <Menu theme="dark" mode="horizontal" selectedKeys={[topSelected]} onClick={({ key }) => navigate(key)}
          items={topNav.map((i) => ({ key: i.key, icon: topIcon[i.key], label: i.label }))}
          style={{ flex: 1, minWidth: 0, background: "transparent", borderBottom: "none", marginInlineStart: 40 }} />
        <Space size={18} style={{ color: "#fff" }}>
          <a onClick={() => { localStorage.removeItem("bg_intro_date"); window.location.reload(); }}
            style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }} title="重新播放通電序列開場">重看開場</a>
          <Popover trigger="click" placement="bottomRight" content={<AccountPanel />} destroyTooltipOnHide>
            <span style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }} title="帳號 / 訪客統計">
              <UserOutlined /><span>總務處 admin</span><DownOutlined style={{ fontSize: 10, opacity: 0.7 }} />
            </span>
          </Popover>
        </Space>
      </Header>

      <Content style={{ margin: 10, flex: 1, minHeight: 0, overflow: "auto" }}>
        {children}
      </Content>
    </Layout>
  );
}
