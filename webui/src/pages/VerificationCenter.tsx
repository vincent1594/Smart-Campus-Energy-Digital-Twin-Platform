// 驗證中心 —— 全平台數字的可信度透明揭露 + 驗證待辦 + 開發路線圖。
// 資料全來自 lib/provenance.ts(單一來源);本頁僅負責呈現,對外 demo 亦可展示。
import { Card, Tag, Tooltip } from "antd";
import { CheckCircleTwoTone, ClockCircleOutlined } from "@ant-design/icons";
import {
  LIMITATIONS, MODEL_RECON, PROVENANCE, ROADMAP, TIERS, VERIFY,
  type Tier,
} from "../lib/provenance";

const TIER_ORDER: Tier[] = ["measured", "model", "assumption", "placeholder"];
const ROADMAP_COL = [
  { status: "done" as const, title: "已上線", color: "#52c41a" },
  { status: "doing" as const, title: "進行中", color: "#1677ff" },
  { status: "planned" as const, title: "規劃中", color: "#8c8c8c" },
];

export default function VerificationCenter() {
  const countOf = (t: Tier) => PROVENANCE.filter((p) => p.tier === t).length;

  return (
    <div style={{ height: "100%", overflow: "auto", paddingRight: 4 }}>
      {/* 標題 + 圖例 */}
      <Card size="small" style={{ marginBottom: 10 }} styles={{ body: { padding: "12px 16px" } }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>驗證中心 · 資料可信度透明揭露</div>
            <div style={{ color: "#888", fontSize: 12, marginTop: 2 }}>
              每個數字都標明來源:哪些是實測、哪些是模型推算、哪些是待校正的假設、哪些尚未接真實資料。誠實是這頁的目的。
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {TIER_ORDER.map((t) => (
              <Tooltip key={t} title={TIERS[t].desc}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "#555", border: `1px solid ${TIERS[t].color}`, borderRadius: 14, padding: "2px 10px" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: TIERS[t].color }} />
                  {TIERS[t].label}<b style={{ color: TIERS[t].color }}>{countOf(t)}</b>
                </span>
              </Tooltip>
            ))}
          </div>
        </div>
      </Card>

      {/* 模型 ⇄ Excel 規格核對(拓樸對得上嗎) */}
      <Card size="small" style={{ marginBottom: 10, borderColor: "#ffd591" }}
        title={<span><span style={{ color: "#fa8c16" }}>⚠ 模型 ⇄ Excel 規格核對</span> <span style={{ color: "#aaa", fontSize: 11, fontWeight: 400 }}>拓樸/容量對得上嗎</span></span>}
        styles={{ body: { padding: "10px 14px" } }}>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 10, lineHeight: 1.6 }}>{MODEL_RECON.summary}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
          <div>
            {MODEL_RECON.rows.map((r) => (
              <div key={r.label} style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 16px", gap: 6, alignItems: "center", fontSize: 12.5, padding: "5px 0", borderBottom: "1px solid #f5f5f5" }}>
                <span style={{ color: "#555" }}>{r.label}</span>
                <span style={{ textAlign: "right", color: r.gap ? "#cf1322" : "#333" }}>模型 {r.model}</span>
                <span style={{ textAlign: "right", color: "#333" }}>Excel {r.excel}</span>
                <span style={{ textAlign: "center" }}>{r.gap ? <span style={{ color: "#cf1322" }}>✕</span> : <span style={{ color: "#52c41a" }}>✓</span>}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#fa8c16", marginBottom: 4 }}>模型涵蓋 vs 待補（南電已建模,剩北電 N 棟 1 台）</div>
            {MODEL_RECON.missing.map((m) => (
              <div key={m.name} style={{ fontSize: 12, padding: "3px 0", display: "flex", justifyContent: "space-between", gap: 8 }}>
                <b style={{ color: "#444", whiteSpace: "nowrap" }}>{m.name}</b>
                <span style={{ color: "#999", textAlign: "right" }}>{m.detail}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 10, padding: "7px 10px", background: "#fffbe6", border: "1px solid #ffe58f", borderRadius: 4, fontSize: 12, color: "#7a5a00", lineHeight: 1.5 }}>
          {MODEL_RECON.verifyNote}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 10, alignItems: "start" }}>
        {/* 左:資料可信度分級 */}
        <Card size="small" title={<span className="cmd-accentbar">資料可信度分級</span>} styles={{ body: { padding: "4px 10px 10px" } }}>
          {TIER_ORDER.map((t) => {
            const items = PROVENANCE.filter((p) => p.tier === t);
            return (
              <div key={t} style={{ marginTop: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: TIERS[t].color }} />
                  <b style={{ color: TIERS[t].color }}>{TIERS[t].label}</b>
                  <span style={{ color: "#aaa", fontSize: 11 }}>{TIERS[t].desc}</span>
                </div>
                {items.map((it) => (
                  <div key={it.feature} style={{ display: "grid", gridTemplateColumns: "1fr", gap: 1, padding: "6px 10px", marginBottom: 5, borderLeft: `3px solid ${TIERS[t].color}`, background: "#fafafa", borderRadius: "0 4px 4px 0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <b style={{ fontSize: 13 }}>{it.feature}</b>
                      <Tag style={{ margin: 0, fontSize: 11, color: "#999", background: "#fff" }}>{it.page}</Tag>
                    </div>
                    <div style={{ fontSize: 12, color: "#555" }}>來源:{it.source}</div>
                    {it.note && <div style={{ fontSize: 11, color: "#999" }}>{it.note}</div>}
                  </div>
                ))}
              </div>
            );
          })}
        </Card>

        {/* 右:驗證待辦 + 已知限制 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Card size="small" title={<span className="cmd-accentbar">驗證待辦 <span style={{ color: "#aaa", fontSize: 11, fontWeight: 400 }}>(需與營繕組 / 現場對答案)</span></span>}
            styles={{ body: { padding: "6px 12px 10px" } }}>
            {VERIFY.map((v) => (
              <div key={v.item} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px solid #f5f5f5" }}>
                <span style={{ marginTop: 1 }}>
                  {v.done ? <CheckCircleTwoTone twoToneColor="#52c41a" /> : <ClockCircleOutlined style={{ color: "#bbb" }} />}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: v.done ? "#999" : "#333", textDecoration: v.done ? "line-through" : "none" }}>{v.item}</div>
                  <div style={{ fontSize: 11, color: "#999" }}>
                    <Tag color={v.done ? "green" : "default"} style={{ marginInlineEnd: 6, fontSize: 11 }}>{v.owner}</Tag>
                    {v.impact}
                  </div>
                </div>
              </div>
            ))}
          </Card>

          <Card size="small" title={<span className="cmd-accentbar">已知限制(誠實揭露)</span>} styles={{ body: { padding: "8px 12px" } }}>
            {LIMITATIONS.map((l, i) => (
              <div key={i} style={{ display: "flex", gap: 6, fontSize: 12, color: "#666", padding: "3px 0", lineHeight: 1.5 }}>
                <span style={{ color: "#fa8c16" }}>•</span><span>{l}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {/* 下:開發路線圖 */}
      <Card size="small" title={<span className="cmd-accentbar">開發路線圖</span>} style={{ marginTop: 10 }} styles={{ body: { padding: 10 } }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {ROADMAP_COL.map((col) => {
            const items = ROADMAP.filter((r) => r.status === col.status);
            return (
              <div key={col.status}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: col.color }} />
                  <b style={{ fontSize: 13, color: col.color }}>{col.title}</b>
                  <span style={{ color: "#bbb", fontSize: 11 }}>{items.length}</span>
                </div>
                {items.map((r) => (
                  <div key={r.title} style={{ padding: "5px 8px", marginBottom: 5, background: "#fafafa", borderRadius: 4, borderLeft: `3px solid ${col.color}` }}>
                    <div style={{ fontSize: 12.5, color: "#333" }}>{r.title}</div>
                    {r.note && <div style={{ fontSize: 11, color: "#999" }}>{r.note}</div>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
