import { CloseOutlined, EnvironmentOutlined, ExperimentOutlined } from "@ant-design/icons";
import { Button, Space, Tag } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import { kindLabel, useFocus } from "../focus/FocusContext";

// 常駐頂部的「目前關注」列。沒有焦點時不顯示。
export default function FocusBar() {
  const { focus, setFocus } = useFocus();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (!focus) return null;

  const canSimulate = focus.kind === "building" || focus.kind === "transformer";

  return (
    <div style={{ background: "#e6f4ff", border: "1px solid #91caff", borderRadius: 8, padding: "6px 12px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ color: "#555" }}>目前關注:</span>
      <Tag color="blue">{kindLabel[focus.kind]}</Tag>
      <b>{focus.label ?? focus.id}</b>
      <Space style={{ marginLeft: "auto" }}>
        {pathname !== "/" && <Button size="small" icon={<EnvironmentOutlined />} onClick={() => navigate("/")}>在地圖顯示</Button>}
        {canSimulate && <Button size="small" type="primary" ghost icon={<ExperimentOutlined />} onClick={() => navigate("/scenario")}>評估加負載</Button>}
        <Button size="small" icon={<CloseOutlined />} onClick={() => setFocus(null)}>清除</Button>
      </Space>
    </div>
  );
}
