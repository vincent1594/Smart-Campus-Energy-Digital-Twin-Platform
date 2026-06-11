import { Empty } from "antd";

export default function Placeholder({ title }: { title: string }) {
  return (
    <div style={{ paddingTop: 80 }}>
      <Empty description={`${title} — 尚未實作`} />
    </div>
  );
}
