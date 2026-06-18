import {
  AlertOutlined, AppstoreOutlined, DashboardOutlined,
  EnvironmentOutlined, FileTextOutlined, FundProjectionScreenOutlined,
  HomeOutlined, LineChartOutlined, ThunderboltOutlined, UserOutlined,
} from "@ant-design/icons";
import { Layout, Menu, Space } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";

const { Header, Content } = Layout;

const topNav = [
  { key: "/", label: "校園總覽" },
  { key: "/buildings", label: "建築查詢" },
  { key: "/assets", label: "設備查詢" },
  { key: "/scenario", label: "規劃模擬" },
  { key: "/demand", label: "需量契約" },
  { key: "/history", label: "歷史趨勢" },
  { key: "/alarms", label: "告警紀錄" },
  { key: "/report", label: "報表匯出" },
];

const topIcon: Record<string, ReactNode> = {
  "/": <DashboardOutlined />, "/map": <EnvironmentOutlined />, "/buildings": <HomeOutlined />,
  "/assets": <AppstoreOutlined />, "/scenario": <FundProjectionScreenOutlined />,
  "/demand": <ThunderboltOutlined />,
  "/history": <LineChartOutlined />, "/alarms": <AlertOutlined />, "/report": <FileTextOutlined />,
};

export default function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const topSelected = topNav.find((i) => i.key === pathname)?.key ?? "/";

  return (
    <Layout style={{ height: "100vh" }}>
      <Header style={{ background: "#001529", paddingInline: 20, height: 52, lineHeight: "52px", display: "flex", alignItems: "center", gap: 23 }}>
        <img src="/stust-logo.png" alt="STUST" title="回首頁(重新整理)" onClick={() => { window.location.href = "/"; }}
          style={{ height: 30, display: "block", cursor: "pointer" }} />
        <Menu theme="dark" mode="horizontal" selectedKeys={[topSelected]} onClick={({ key }) => navigate(key)}
          items={topNav.map((i) => ({ key: i.key, icon: topIcon[i.key], label: i.label }))}
          style={{ flex: 1, minWidth: 0, background: "transparent", borderBottom: "none", marginInlineStart: 40 }} />
        <Space size={18} style={{ color: "#fff" }}>
          <Space size={6}><UserOutlined /><span>總務處 admin</span></Space>
        </Space>
      </Header>

      <Content style={{ margin: 10, flex: 1, minHeight: 0, overflow: "auto" }}>
        {children}
      </Content>
    </Layout>
  );
}
