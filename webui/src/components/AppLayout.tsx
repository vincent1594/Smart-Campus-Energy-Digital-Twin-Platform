import {
  AlertOutlined, AppstoreOutlined, CloudOutlined, DashboardOutlined,
  EnvironmentOutlined, FileTextOutlined, FundProjectionScreenOutlined,
  HomeOutlined, LineChartOutlined, UserOutlined,
} from "@ant-design/icons";
import { Layout, Menu, Space } from "antd";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";

const { Header, Content } = Layout;

const topNav = [
  { key: "/", label: "校園總覽" },
  { key: "/map", label: "校園地圖" },
  { key: "/buildings", label: "建築查詢" },
  { key: "/assets", label: "設備查詢" },
  { key: "/scenario", label: "規劃模擬" },
  { key: "/history", label: "歷史趨勢" },
  { key: "/alarms", label: "告警紀錄" },
  { key: "/report", label: "報表匯出" },
];

const topIcon: Record<string, ReactNode> = {
  "/": <DashboardOutlined />, "/map": <EnvironmentOutlined />, "/buildings": <HomeOutlined />,
  "/assets": <AppstoreOutlined />, "/scenario": <FundProjectionScreenOutlined />,
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
    <Layout style={{ height: "100vh" }}>
      <Header style={{ background: "#001529", paddingInline: 20, display: "flex", alignItems: "center", gap: 62 }}>
        <img src="/stust-logo.png" alt="STUST" style={{ height: 30, display: "block" }} />
        <Menu theme="dark" mode="horizontal" selectedKeys={[topSelected]} onClick={({ key }) => navigate(key)}
          items={topNav.map((i) => ({ key: i.key, icon: topIcon[i.key], label: i.label }))}
          style={{ flex: 1, minWidth: 0, background: "transparent", borderBottom: "none" }} />
        <Space size={18} style={{ color: "#fff" }}>
          <Space size={6}><CloudOutlined style={{ color: "#69b1ff" }} /><span>28°C</span><span style={{ color: "#8c8c8c", fontSize: 12 }}>{now}</span></Space>
          <Space size={6}><UserOutlined /><span>總務處 admin</span></Space>
        </Space>
      </Header>

      <Content style={{ margin: 10, flex: 1, minHeight: 0, overflow: "auto" }}>
        {children}
      </Content>
    </Layout>
  );
}
