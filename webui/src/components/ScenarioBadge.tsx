import { Tag } from "antd";
import { useNetScenario } from "../scenario/ActiveScenarioContext";

// 情境連動標示:設備/建築查詢套用情境 (what-if / 日曲線時段) 時,負載數字為模擬值 (非基準),於連動分頁頂部標明。
export default function ScenarioBadge() {
  const { scenario, scenarioKind } = useNetScenario();
  if (!scenario) return null;
  return scenarioKind === "time"
    ? <Tag color="cyan" style={{ marginBottom: 8 }}>🕒 時段負載(連動)· 數值為模擬、非基準</Tag>
    : <Tag color="orange" style={{ marginBottom: 8 }}>模擬情境(連動)· 數值為模擬、非基準</Tag>;
}
