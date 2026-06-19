// 使用說明 —— 嵌在「報表匯出」頁的分頁。平台簡介 + 各功能怎麼用 + 操作技巧。
import { Tag } from "antd";

const FEATURES: { nav: string; what: string; how: string }[] = [
  {
    nav: "校園總覽",
    what: "全系統即時概況:左欄 KPI(總負載/損耗/電壓/功因/碳排)、中間校園地圖或高壓單線圖、右欄焦點詳情。",
    how: "點地圖上的建築 → 高亮整條供電關係、右欄顯示該棟詳情;切「查供電路徑 / 看停電影響」看不同視角;「地圖 / 單線圖」可切換。未選取時右欄顯示負載率最高設備、用電最高建築。",
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
    what: "EMS 北電錶實測逐時(2023/05–06)聚合:每日尖峰/平均、典型日曲線(平日/假日)、各饋線占比。",
    how: "純檢視;左欄看實測概況與各饋線、右側兩張趨勢圖。屬負載型態分析,非跨年成長(僅 2 個月實測)。",
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
  "負載率以顏色分級:綠 正常(<50%)、黃 中載(50–80%)、橙 吃緊(80–100%)、紅 過載(>100%)。",
  "能源管理的契約/費率按「存為預設」後,重整或別人開都會帶出校正值(全站套用)。",
  "右上「總務處 admin」面板:登入後可看訪客統計與來源 IP。",
  "右上「重看開場」可重播進站的電網傳輸動畫。",
];

export default function UsageGuide() {
  return (
    <div style={{ maxWidth: 820 }}>
      {/* 簡介 */}
      <div style={{ background: "#f0f7ff", border: "1px solid #d6e8ff", borderRadius: 8, padding: "12px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>這是什麼</div>
        <div style={{ fontSize: 13, color: "#444", lineHeight: 1.7 }}>
          <b>校園配電數位分身平台</b> —— 把學校的高壓配電(台電進線 → 受電站 → VCB → 饋線 → 變壓器 → 各棟)做成可互動的模型,
          給營繕組/總務組看<b>電力現況、省電費、設備汰換規劃</b>。涵蓋範圍目前為<Tag color="geekblue" style={{ margin: "0 2px" }}>北電錶區</Tag>;
          多數數值為規劃估算,各數字來源與可信度詳見<b>「驗證中心」</b>。
        </div>
      </div>

      {/* 功能導覽 */}
      <div style={{ fontSize: 14, fontWeight: 700, margin: "4px 0 8px" }}>功能導覽</div>
      {FEATURES.map((f, i) => (
        <div key={f.nav} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: i < FEATURES.length - 1 ? "1px solid #f0f0f0" : "none" }}>
          <div style={{ flex: "0 0 84px" }}>
            <Tag color="blue" style={{ margin: 0 }}>{f.nav}</Tag>
          </div>
          <div style={{ flex: 1, fontSize: 13, lineHeight: 1.65 }}>
            <div style={{ color: "#333" }}>{f.what}</div>
            <div style={{ color: "#888", marginTop: 3 }}><span style={{ color: "#1677ff" }}>怎麼用:</span>{f.how}</div>
          </div>
        </div>
      ))}

      {/* 操作技巧 */}
      <div style={{ fontSize: 14, fontWeight: 700, margin: "18px 0 8px" }}>操作技巧</div>
      {TIPS.map((t, i) => (
        <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: "#555", padding: "4px 0", lineHeight: 1.6 }}>
          <span style={{ color: "#1677ff" }}>•</span><span>{t}</span>
        </div>
      ))}

      <div style={{ color: "#bbb", fontSize: 12, marginTop: 16, lineHeight: 1.6 }}>
        平台為 V1 版,部分數值以業界預設值估算、模型涵蓋北電錶區;校正進度與待辦見「驗證中心」。
      </div>
    </div>
  );
}
