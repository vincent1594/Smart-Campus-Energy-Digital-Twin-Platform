// 驗證中心的單一資料來源 —— 全平台數字的可信度、限制、驗證待辦與路線圖都集中於此。
// 之後新增/修改功能時,只改這個檔,清單就不會說謊。對外 demo 也敢給人看。

export type Tier = "measured" | "model" | "assumption" | "placeholder";

export const TIERS: Record<Tier, { label: string; color: string; badge: string; desc: string }> = {
  measured: { label: "實測", color: "#52c41a", badge: "🟢", desc: "真實量測 / 原始銘牌 / 官方統計" },
  model: { label: "模型推算", color: "#1677ff", badge: "🔵", desc: "物理潮流或 ML 由實測資料算出" },
  assumption: { label: "假設·待校正", color: "#fa8c16", badge: "🟡", desc: "預設參數,需依自家資料校正" },
  placeholder: { label: "示範·未接", color: "#cf1322", badge: "🔴", desc: "示範情境或尚未接真實資料源" },
};

export interface ProvenanceItem {
  feature: string;   // 功能 / 數字
  tier: Tier;
  source: string;    // 來源
  note?: string;     // 限制 / 備註
  page: string;      // 對應分頁
}

export const PROVENANCE: ProvenanceItem[] = [
  // 🟢 實測
  { feature: "逐時負載(11 饋線)", tier: "measured", source: "校內 EMS 北電錶實測 2023/05–06", note: "歷史趨勢、契約最佳化尖峰錨點、XGBoost 訓練皆源此;僅 2 個月", page: "歷史趨勢" },
  { feature: "變壓器銘牌規格", tier: "measured", source: "各站變壓器規格容量表 (Excel)", note: "設備查詢「規格明細」忠實呈現,不對應潮流模型", page: "設備查詢" },
  { feature: "樓地板面積", tier: "measured", source: "112 年校舍統計表", note: "建築查詢 / EUI 分母", page: "設備查詢 · 用電強度" },
  { feature: "契約容量 3,250 kW", tier: "measured", source: "營繕組確認", note: "北電錶經常契約;影響全部需量/罰款計算", page: "能源管理" },
  { feature: "電網拓樸(線徑/長度/容量/VCB)", tier: "measured", source: "校內單線圖 / 設備清冊", note: "pandapower 建模基礎", page: "校園總覽 · 設備查詢" },

  // 🔵 模型推算
  { feature: "電壓 / 負載率 / 系統損耗 / 市電進線", tier: "model", source: "pandapower Newton-Raphson 潮流", note: "單時點 / 情境快照", page: "校園總覽 · 規劃模擬" },
  { feature: "逐時負載預測", tier: "model", source: "XGBoost(11 饋線各一模型)", note: "驅動需量預警 / 電費 / EUI 年用電 / 模擬時點", page: "能源管理 · 規劃模擬" },

  // 🟡 假設·待校正
  { feature: "台電三段式時間電價費率", tier: "assumption", source: "預設範例值", note: "請依台電最新電價表 / 自家合約校正", page: "能源管理 · 時間電價" },
  { feature: "基本電費單價 223.6 / 166.9", tier: "assumption", source: "台電高壓參考值", note: "前端可編輯", page: "能源管理" },
  { feature: "契約最佳化全年外推", tier: "assumption", source: "規劃假設(高需量月數=4、離峰×0.70)", note: "尖峰錨點為實測,僅季節外推屬假設;可調", page: "能源管理 · 契約最佳化" },
  { feature: "EUI 參考基準 120", tier: "assumption", source: "全國大專參考區間", note: "建議填學校歷史值;前端可編輯", page: "用電強度" },
  { feature: "汰換風險權重", tier: "assumption", source: "工程判斷(屆齡.40/負載.25/溫度.20/效率.15)", note: "相對排序,非絕對壽命", page: "設備查詢 · 汰換優先序" },
  { feature: "各棟年用電量", tier: "assumption", source: "現況負載占比 × 全校年預測", note: "近似分配,非各棟獨立電錶", page: "用電強度" },
  { feature: "汰換投資回收(成本/年省/回收年限)", tier: "assumption", source: "標準變壓器損耗模型 + 換新單價假設", note: "節能用銘牌典型損耗(非 spec.efficiency,其值域不合理);單價/電價前端可編輯", page: "設備查詢 · 汰換投資回收" },

  // 🔴 示範·未接
  { feature: "告警紀錄", tier: "placeholder", source: "示範情境(連動真實負載觸發)", note: "用以演示告警邏輯;尚未接即時告警源 / 歷史告警庫", page: "告警紀錄" },
  { feature: "南電錶區域", tier: "placeholder", source: "未建模", note: "目前僅北電錶(X 棟為 TPC/VCB 收斂);潮流模型僅 37/52 台變壓器、缺 ~36% 容量(見下方模型⇄Excel核對)", page: "—" },
];

export const LIMITATIONS: string[] = [
  "XGBoost 僅有時刻/星期特徵,無氣溫與月份 → 夏季尖峰可能偏低、不反映季節差異。",
  "逐時 kW 以 1 小時積分為度數;台電以 15 分鐘需量計,屬規劃估算。",
  "超約罰款簡化為單一經常契約 vs 全月最高需量;未計國定假日。",
  "EUI 各棟以負載占比近似;樓地板 < 2,000 m² 易受分母放大失真,僅供參考。",
  "設備汰換為相對風險排序,需現場檢測(油測 / 紅外線)佐證。",
  "全平台為單時點 / 情境快照,無長期時序資料庫(EMS 實測僅 2 個月)。",
];

// 模型(pandapower 拓樸)⇄ Excel 規格表 涵蓋度核對 —— 兩者為獨立來源
export interface ReconRow { label: string; model: string; excel: string; gap: boolean }
export const MODEL_RECON: {
  summary: string;
  rows: ReconRow[];
  missing: { name: string; detail: string }[];
  verifyNote: string;
} = {
  summary:
    "潮流模型(pandapower)的拓樸/容量是手刻定義(network_structure.py),Excel 規格表是另一份獨立來源。兩者涵蓋範圍不同:模型僅含北電錶區,故模型算出的負載率/電壓只代表北電錶區,勿當全校。",
  rows: [
    { label: "變壓器台數", model: "37 台(另 2 台停用)", excel: "52 台", gap: true },
    { label: "裝置總容量", model: "22,000 kVA", excel: "34,250 kVA", gap: true },
    { label: "1000 kVA 機組", model: "0 台", excel: "8 台", gap: true },
    { label: "200/250/500/600/1500 kVA 級距", model: "相符", excel: "相符", gap: false },
  ],
  missing: [
    { name: "E圖書資訊館", detail: "5 台 / 4,750 kVA(含 4×1000kVA)" },
    { name: "H6第六宿舍", detail: "4 台 / 3,750 kVA(含 3×1000kVA)" },
    { name: "H1第一宿舍", detail: "3 台 / 1,700 kVA(含 1×1000kVA)" },
    { name: "其餘零星", detail: "O活動中心 / U學生活動 / 雨水處理等,及部分站別少計(如 N棟 Excel 2 台、模型 1 台)" },
  ],
  verifyNote:
    "待確認:上述未建模建築是否皆屬南電錶/他表(與「北電錶 only」範圍一致),或有北電該建而漏建者 → 補建模或在介面明確標示涵蓋範圍。",
};

export interface VerifyItem { item: string; done: boolean; owner: string; impact: string; }

export const VERIFY: VerifyItem[] = [
  { item: "契約容量 3,250 kW", done: true, owner: "營繕組", impact: "全部需量 / 罰款計算的基準" },
  { item: "台電實際費率與合約條件", done: false, owner: "營繕組", impact: "校正電費與超約罰款" },
  { item: "實際超約罰款帳單", done: false, owner: "營繕組", impact: "對照估算 ~NT$ 231 萬/年準不準" },
  { item: "變壓器實際屆齡 / 廠牌年份", done: false, owner: "現場 / 財產清冊", impact: "核對汰換優先序" },
  { item: "學校 EUI 歷史申報值", done: false, owner: "營繕組", impact: "校正節能基準" },
  { item: "是否功因不足被罰", done: false, owner: "營繕組", impact: "決定是否新增功因防線" },
  { item: "未建模建築(E圖書資訊館 / H1·H6 宿舍等 15 台)是否屬南電錶", done: false, owner: "營繕組", impact: "釐清模型涵蓋範圍;模型負載率/電壓僅代北電錶區" },
  { item: "南電錶逐時 / 拓樸資料", done: false, owner: "營繕組", impact: "達成全校覆蓋" },
];

export interface RoadmapItem { title: string; status: "done" | "doing" | "planned"; note?: string; }

export const ROADMAP: RoadmapItem[] = [
  { title: "需量契約預警 + 卸載建議", status: "done" },
  { title: "契約容量最佳化", status: "done", note: "揭露超約 30%、削峰可省 ~231 萬" },
  { title: "時間電價電費試算", status: "done" },
  { title: "用電強度 EUI", status: "done" },
  { title: "設備汰換風險排序", status: "done" },
  { title: "歷史趨勢 + 互動單線圖", status: "done" },
  { title: "驗證中心", status: "done" },
  { title: "設備汰換投資回收(NT$/回收年限)", status: "done", note: "高風險群換新總額/年省/回收年限" },
  { title: "功因罰款防線", status: "planned" },
  { title: "南電錶建模(全校覆蓋)", status: "planned" },
  { title: "即時 EMS 串接", status: "planned" },
  { title: "告警 LINE 推播", status: "planned" },
  { title: "V2 太陽能 + 儲能(綠能管理)", status: "planned" },
];
