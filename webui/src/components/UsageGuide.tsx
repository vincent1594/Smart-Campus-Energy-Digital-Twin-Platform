// 使用說明 —— 嵌在「報表匯出」頁的分頁。平台簡介 + 各功能怎麼用 + 操作技巧。
import { FilePdfOutlined } from "@ant-design/icons";
import { Button, Tag } from "antd";

const FEATURES: { nav: string; what: string; how: string }[] = [
  {
    nav: "校園總覽",
    what: "全系統即時概況:左欄 KPI(總負載/損耗/電壓/功因/碳排)+ 日負載曲線、中間校園地圖或高壓單線圖、右欄焦點詳情。基準為歷史實測尖峰日(EMS 全期最高負載那天)。",
    how: "點地圖建築 → 高亮供電關係、右欄該棟詳情;左欄日負載曲線可「拖曳基準點」看尖峰日各時段,KPI/地圖即時連動;切「查供電路徑 / 看停電影響」看不同視角(看停電影響時,該 VCB 供電的棟別會紅色亮起);「地圖 / 單線圖」可切換。未選取時右欄顯示負載率最高設備、用電最高建築。",
  },
  {
    nav: "設備查詢",
    what: "建築、變壓器、VCB、饋線的清冊與規格;以及兩個資本門工具:汰換優先序、汰換投資回收。",
    how: "上方分頁切換類別;可排序/搜尋。「汰換優先序」依風險排序、「汰換投資回收」算換新成本與回收年限,皆可匯出 CSV。「饋線」顯示線徑與推估 R/X。",
  },
  {
    nav: "規劃模擬",
    what: "What-if 模擬:改總負載/單區負載/變壓器容量/饋線長度,或選一個未來時間點(XGBoost 預測),看對潮流的影響。",
    how: "左側設定參數 → 按「執行模擬」→ 中間地圖把過載棟標紅、右側顯示修改前後對比。模擬情境會跨頁連動(校園總覽、焦點詳情都會反映)。按「重設」還原。",
  },
  {
    nav: "能源管理",
    what: "打台電帳單痛點:① 需量預警(超約罰款試算 + 卸載建議)② 契約最佳化(年成本曲線、削峰可省)③ 時間電價月電費 ④ 用電強度 EUI。",
    how: "需量預警左側填契約容量/費率即時試算;按「存為預設」可把校正值存起來、全站套用。契約最佳化看 U 曲線找最佳契約。各費率欄位可依台電電價表編輯。",
  },
  {
    nav: "歷史趨勢",
    what: "EMS 北電錶實測逐時(2023/03–06)聚合:每日尖峰/平均、典型日曲線(平日/假日)、各饋線占比。",
    how: "純檢視;左欄看實測概況與各饋線、右側兩張趨勢圖。屬負載型態分析,非跨年成長(約 4 個月實測,缺暑假)。",
  },
  {
    nav: "告警紀錄",
    what: "現況/情境的越限告警:變壓器或饋線負載率 ≥80%、建築電壓偏低。",
    how: "套用模擬情境時告警會連動。(目前為示範情境,尚未接即時告警源。)",
  },
  {
    nav: "報表匯出",
    what: "把各清單(變壓器、規格、建築、饋線、告警、系統摘要)匯成 CSV(UTF-8,Excel 可直接開)。",
    how: "在「報表下載」分頁,先「預覽」確認內容、再「下載 CSV」;或「直接匯出」。取目前現況快照。",
  },
  {
    nav: "驗證中心",
    what: "資料可信度透明揭露:🟢實測 / 🔵模型推算 / 🟡假設待校正 / 🔴示範未接,加上模型⇄Excel 核對、驗證待辦、開發路線圖。",
    how: "想知道某個數字可不可信、來源是什麼,來這裡查。每筆標來源與限制。",
  },
];

const TIPS: string[] = [
  "點地圖建築 → 右欄焦點詳情會連動顯示供電路徑(台電 → X 受電站 → VCB → 饋線 → 變壓器 → 建築)。",
  "校園總覽左欄日負載曲線:拖曳曲線上的基準點,即可看尖峰日各時段的 KPI 與地圖負載,像「時間軸模擬」。",
  "切「看停電影響」後點某 VCB(或在影響模式點棟)→ 該 VCB 供電的棟別紅色亮起,即停電波及範圍。",
  "負載率以顏色分級:綠 正常(<50%)、黃 中載(50–80%)、橙 吃緊(80–100%)、紅 過載(>100%)。",
  "能源管理的契約/費率按「存為預設」後,重整或別人開都會帶出校正值(全站套用)。",
  "右上「總務處 admin」面板:登入後可看訪客統計與來源 IP。",
  "右上「重看開場」可重播進站的電網傳輸動畫。",
];

const INTRO_HTML =
  "<b>校園配電數位分身平台</b> —— 把學校的高壓配電(台電進線 → 受電站 → VCB → 饋線 → 變壓器 → 各棟)做成可互動的模型," +
  "給營繕組/總務組看<b>電力現況、省電費、設備汰換規劃</b>。涵蓋範圍目前為<b>北電錶區</b>;多數數值為規劃估算,各數字來源與可信度詳見<b>「驗證中心」</b>。";

// 用瀏覽器內建列印 → 另存為 PDF(品質好、零相依);內容用同一份資料生成
function exportPdf() {
  const feat = FEATURES.map((f) =>
    `<div class="f"><div class="nav">${f.nav}</div><div class="b"><div>${f.what}</div>` +
    `<div class="how"><b>怎麼用:</b>${f.how}</div></div></div>`).join("");
  const tips = TIPS.map((t) => `<li>${t}</li>`).join("");
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>使用說明</title><style>
    *{box-sizing:border-box}
    body{font-family:"Microsoft JhengHei","PingFang TC",sans-serif;color:#222;font-size:12.5px;line-height:1.7;margin:0;padding:24px}
    h1{font-size:20px;border-bottom:3px solid #1677ff;padding-bottom:6px;margin:0 0 2px}
    .sub{color:#999;font-size:12px;margin-bottom:14px}
    .intro{background:#f0f7ff;border:1px solid #d6e8ff;border-radius:8px;padding:12px 14px;margin-bottom:16px}
    h2{font-size:14px;margin:16px 0 8px;color:#1677ff}
    .f{display:flex;gap:12px;padding:8px 0;border-bottom:1px solid #eee;page-break-inside:avoid}
    .nav{flex:0 0 90px;font-weight:700;color:#1677ff}
    .how{color:#666;margin-top:2px}.how b{color:#1677ff;font-weight:600}
    ul{padding-left:20px;margin:6px 0}li{margin:4px 0}
    .foot{color:#aaa;font-size:11px;margin-top:18px}
  </style></head><body>
    <h1>校園配電數位分身平台 · 使用說明</h1>
    <div class="sub">V1 · 北電錶區</div>
    <div class="intro">${INTRO_HTML}</div>
    <h2>功能導覽</h2>${feat}
    <h2>操作技巧</h2><ul>${tips}</ul>
    <div class="foot">平台為 V1 版,部分數值以業界預設值估算、模型涵蓋北電錶區;校正進度與待辦見「驗證中心」。</div>
  </body></html>`;
  const w = window.open("", "_blank", "width=900,height=720");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 350);
}

export default function UsageGuide() {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>這是什麼</span>
        <Button size="small" icon={<FilePdfOutlined />} onClick={exportPdf}>匯出 PDF / 列印</Button>
      </div>
      {/* 簡介(精簡) */}
      <div style={{ background: "#f0f7ff", border: "1px solid #d6e8ff", borderRadius: 6, padding: "7px 12px", marginBottom: 10, fontSize: 12, color: "#444", lineHeight: 1.55 }}>
        <b>校園配電數位分身平台</b> —— 把學校高壓配電(台電 → 受電站 → VCB → 饋線 → 變壓器 → 各棟)做成可互動模型,
        給營繕組/總務組看<b>電力現況、省電費、設備汰換</b>。涵蓋<b>北電錶區</b>;多數為規劃估算,來源/可信度見<b>「驗證中心」</b>。
      </div>

      {/* 功能導覽:多欄卡片 */}
      <div style={{ fontSize: 13, fontWeight: 700, margin: "2px 0 6px" }}>功能導覽</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 8 }}>
        {FEATURES.map((f) => (
          <div key={f.nav} style={{ border: "1px solid #eef1f5", borderRadius: 6, padding: "6px 10px", background: "#fafbfc" }}>
            <Tag color="blue" style={{ margin: "0 0 3px", fontSize: 11 }}>{f.nav}</Tag>
            <div style={{ fontSize: 12, color: "#333", lineHeight: 1.5 }}>{f.what}</div>
            <div style={{ fontSize: 11.5, color: "#888", marginTop: 2, lineHeight: 1.5 }}>
              <span style={{ color: "#1677ff" }}>怎麼用:</span>{f.how}
            </div>
          </div>
        ))}
      </div>

      {/* 操作技巧 */}
      <div style={{ fontSize: 13, fontWeight: 700, margin: "10px 0 4px" }}>操作技巧</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", columnGap: 20, rowGap: 0 }}>
        {TIPS.map((t, i) => (
          <div key={i} style={{ display: "flex", gap: 6, fontSize: 11.5, color: "#555", padding: "2px 0", lineHeight: 1.5 }}>
            <span style={{ color: "#1677ff" }}>•</span><span>{t}</span>
          </div>
        ))}
      </div>

      <div style={{ color: "#bbb", fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
        平台為 V1 版,部分數值以業界預設值估算、模型涵蓋北電錶區;校正進度與待辦見「驗證中心」。
      </div>
    </div>
  );
}
