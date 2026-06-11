import {
  AlertOutlined, AppstoreOutlined, CloudOutlined, DashboardOutlined,
  EnvironmentOutlined, FileTextOutlined, FundProjectionScreenOutlined,
  HomeOutlined, LineChartOutlined, MonitorOutlined, UserOutlined,
} from "@ant-design/icons";
import { Layout, Menu, Space } from "antd";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import FocusBar from "./FocusBar";

const { Header, Sider, Content } = Layout;

const topNav = [
  { key: "/", label: "校園總覽" },
  { key: "/assets", label: "設備查詢" },
  { key: "/scenario", label: "規劃模擬" },
  { key: "/history", label: "歷史趨勢" },
  { key: "/alarms", label: "告警紀錄" },
  { key: "/report", label: "報表匯出" },
];

const sideItems = [
  {
    type: "group" as const, label: "校園總覽",
    children: [
      { key: "/", icon: <EnvironmentOutlined />, label: "校園總覽(地圖)" },
      { key: "/monitor", icon: <MonitorOutlined />, label: "即時監控" },
    ],
  },
  {
    type: "group" as const, label: "查詢與工具",
    children: [
      { key: "/map", icon: <EnvironmentOutlined />, label: "校園地圖" },
      { key: "/buildings", icon: <HomeOutlined />, label: "建築查詢" },
    ],
  },
];

const topIcon: Record<string, ReactNode> = {
  "/": <DashboardOutlined />, "/assets": <AppstoreOutlined />, "/scenario": <FundProjectionScreenOutlined />,
  "/history": <LineChartOutlined />, "/alarms": <AlertOutlined />, "/report": <FileTextOutlined />,
};

function useClock() {
  const [now, setNow] = useState("");
  useEffect(() => {
    const f = () => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      setNow(`${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
    };
    f();
    const id = setInterval(f, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const now = useClock();
  const topSelected = topNav.find((i) => i.key === pathname)?.key ?? "/";

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ background: "#001529", paddingInline: 20, display: "flex", alignItems: "center", gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#fff" }}>
          <ThunderLogo />
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>校園配電數位孿生平台</div>
            <div style={{ fontSize: 11, color: "#8c8c8c" }}>Campus Electrical Digital Twin</div>
          </div>
        </div>
        <Menu theme="dark" mode="horizontal" selectedKeys={[topSelected]} onClick={({ key }) => navigate(key)}
          items={topNav.map((i) => ({ key: i.key, icon: topIcon[i.key], label: i.label }))}
          style={{ flex: 1, minWidth: 0, background: "transparent", borderBottom: "none" }} />
        <Space size={18} style={{ color: "#fff" }}>
          <Space size={6}><CloudOutlined style={{ color: "#69b1ff" }} /><span>28°C</span><span style={{ color: "#8c8c8c", fontSize: 12 }}>{now}</span></Space>
          <Space size={6}><UserOutlined /><span>總務處 admin</span></Space>
        </Space>
      </Header>

      <Layout>
        <Sider width={210} theme="light" breakpoint="lg" collapsedWidth={0}
          style={{ borderRight: "1px solid #f0f0f0" }}>
          <Menu mode="inline" selectedKeys={[pathname]} items={sideItems}
            onClick={({ key }) => navigate(key)} style={{ borderInlineEnd: "none", paddingTop: 8 }} />
          <div style={{ padding: 12 }}>
            <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #f0f0f0" }}>
              <img src="/trans-img.jpg" alt="南臺科技大學" style={{ width: "100%", display: "block" }} />
              <div style={{ fontSize: 12, color: "#888", padding: "4px 8px" }}>南臺科技大學</div>
            </div>
          </div>
        </Sider>

        <Content style={{ margin: 16, background: "#f5f5f5" }}>
          <FocusBar />
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}

function ThunderLogo() {
  return (
    <div style={{ width: 34, height: 34, borderRadius: 8, background: "#1677ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
      ⚡
    </div>
  );
}
