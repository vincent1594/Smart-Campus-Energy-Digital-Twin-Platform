import { Tag } from "antd";

// 負載率顏色語意:>100% 紅(過載)、80–100% 橘(吃緊)、否則綠(正常)
export function loadRatioColor(ratio: number | null | undefined): string {
  if (ratio == null) return "default";
  if (ratio > 100) return "red";
  if (ratio >= 80) return "orange";
  return "green";
}

export default function LoadRatioTag({ ratio }: { ratio: number | null | undefined }) {
  if (ratio == null) return <Tag>—</Tag>;
  return <Tag color={loadRatioColor(ratio)}>{ratio.toFixed(1)}%</Tag>;
}
