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
  { feature: "逐時負載(11 饋線)", tier: "measured", source: "校內 EMS 北電錶實測 2023/03–06(各饋線)、9–10(僅總量)", note: "歷史趨勢、契約尖峰錨點、預測訓練皆源此;各饋線約 4 個月,缺 7–8 月暑假與整年", page: "歷史趨勢" },
  { feature: "變壓器銘牌規格", tier: "measured", source: "各站變壓器規格容量表 (Excel)", note: "設備查詢「規格明細」忠實呈現,不對應潮流模型", page: "設備查詢" },
  { feature: "樓地板面積", tier: "measured", source: "112 年校舍統計表", note: "建築查詢 / EUI 分母", page: "設備查詢 · 用電強度" },
  { feature: "契約容量 3,250 kW", tier: "measured", source: "營繕組確認", note: "北電錶經常契約;影響全部需量/罰款計算", page: "能源管理" },
  { feature: "微電網設備(C/D、Z 棟太陽能/儲能/發電機)", tier: "measured", source: "技師用印竣工圖 ESS-2.1(大同智能,竣工 2025-10-31)", note: "C/D:PV 98.01kWp、儲能 200kW/430kWh;Z:PV 29.4kWp、儲能 25kW/105kWh、LPG 14kW。D 棟 PV 由原 112.86 改竣工值", page: "微電網" },
  { feature: "電網拓樸(線徑/容量/VCB 接線)", tier: "measured", source: "校內單線圖 / 設備清冊", note: "pandapower 建模基礎(饋線長度除外,見下方)", page: "校園總覽 · 設備查詢" },

  // 🔵 模型推算
  { feature: "電壓 / 負載率 / 系統損耗 / 市電進線", tier: "model", source: "pandapower Newton-Raphson 潮流", note: "基準=EMS 實測尖峰日 2023/06/08 14:00(全期最高負載日,4,220kW);校園總覽可拖曳日曲線看各時段,規劃模擬另做 what-if(含地圖新增建物疊入潮流)", page: "校園總覽 · 規劃模擬" },
  { feature: "逐時負載預測", tier: "model", source: "XGBoost(11 饋線各一模型)", note: "需量預測加學期行事曆+近期負載(lag)特徵 → 逐週不同、含假日(3–5月訓/6月驗,MAPE~20%);電費 / EUI 年用電 / 模擬時點用純時間版", page: "能源管理 · 規劃模擬" },

  // 🟡 假設·待校正
  { feature: "台電三段式時間電價費率", tier: "assumption", source: "預設範例值", note: "請依台電最新電價表 / 自家合約校正", page: "能源管理 · 時間電價" },
  { feature: "基本電費單價 223.6 / 166.9", tier: "assumption", source: "台電高壓參考值", note: "前端可編輯", page: "能源管理" },
  { feature: "契約最佳化全年外推", tier: "assumption", source: "規劃假設(高需量月數=4、離峰×0.70)", note: "尖峰錨點為實測,僅季節外推屬假設;可調", page: "能源管理 · 契約最佳化" },
  { feature: "EUI 參考基準 120", tier: "assumption", source: "全國大專參考區間", note: "建議填學校歷史值;前端可編輯", page: "用電強度" },
  { feature: "汰換風險權重", tier: "assumption", source: "工程判斷(屆齡.40/負載.25/溫度.20/效率.15)", note: "相對排序,非絕對壽命", page: "設備查詢 · 汰換優先序" },
  { feature: "饋線長度 / R / X", tier: "assumption", source: "長度推估(×1.2 經驗係數)、R/X = 線徑單位阻抗 × 長度", note: "實際佈線長度未量測;影響潮流壓降/損耗精度,設備查詢已標「估」", page: "設備查詢 · 饋線" },
  { feature: "微電網運轉狀態(儲能待機、發電機備用)", tier: "assumption", source: "基準情境假設", note: "尚未接 EMS 即時 SOC/充放電;太陽能出力 = kWp × 日照係數(基準為實測淨值,係數 0)", page: "微電網" },
  { feature: "各棟年用電量", tier: "assumption", source: "現況負載占比 × 全校年預測", note: "近似分配,非各棟獨立電錶", page: "用電強度" },
  { feature: "汰換投資回收(成本/年省/回收年限)", tier: "assumption", source: "標準變壓器損耗模型 + 換新單價假設", note: "節能用銘牌典型損耗(非 spec.efficiency,其值域不合理);單價/電價前端可編輯", page: "設備查詢 · 汰換投資回收" },
  { feature: "規劃新增建物模擬", tier: "assumption", source: "接法 A:自受電匯流排新拉獨立饋線;電纜線徑預設 60mm²", note: "疊入 pandapower 重跑潮流 + 額定護欄(過載/低壓);連接方式與線徑為規劃假設,可再細化", page: "規劃模擬" },

  // 🔴 示範·未接
  { feature: "告警紀錄", tier: "placeholder", source: "示範情境(連動真實負載觸發)", note: "用以演示告警邏輯;尚未接即時告警源 / 歷史告警庫", page: "告警紀錄" },
  { feature: "南電錶區域(潮流)", tier: "assumption", source: "networks/south 拓樸已建(6 VCB / 14 台 / 11,000 kVA)", note: "已初步建模、開發中未校正;負載尚未對真實資料,南區負載率/電壓僅供參考。北+南合計 51 台,近全校 Excel 52 台", page: "校園總覽(南)" },
];

export const LIMITATIONS: string[] = [
  "需量預測已加學期行事曆+近期負載特徵(逐週不同、含假日);但電費/EUI 年預測仍為純時間版,無季節 → 夏季可能偏低。實測氣溫對本校負載預測力弱(已驗證),真正驅動為學期行事曆。",
  "需量預測為 holdout(3–5月訓練、6月驗證);無 7–8 月暑假資料,故無法預測暑假等未見過的狀態。",
  "逐時 kW 以 1 小時積分為度數;台電以 15 分鐘需量計,屬規劃估算。",
  "超約罰款簡化為單一經常契約 vs 全月最高需量。",
  "EUI 各棟以負載占比近似;樓地板 < 2,000 m² 易受分母放大失真,僅供參考。",
  "設備汰換為相對風險排序,需現場檢測(油測 / 紅外線)佐證。",
  "校園總覽可拖曳尖峰日 24h 各時段,但全平台仍為情境快照、無長期時序資料庫(EMS 各饋線約 4 個月〔3–6月〕、另 9–10 月僅總量;缺 7–8 月暑假與整年)。",
  "登入為展示用前端驗證(帳密寫死於前端、兩組帳號),非真實安全;正式後端帳密 / 權限角色為 V2。訪客人數以裝置(visitor_id)計;IP 於反向代理後可能顯示為單一出口位址。",
  "微電網設備直接掛在 TR_CD / TR_Z_MAIN 的 220V 母線;中間的介接變壓器(200/75/50kVA)未建成潮流元件,其損耗與壓降未計。C/D、Z 的太陽能以發電設備呈現(負載為實際用電),L/M/P 的太陽能仍從負載淨扣。",
  "規劃模擬「新增建物」為 what-if 疊加:採接法 A(自受電匯流排新拉一路獨立饋線)、電纜線徑預設 60mm²,屬規劃假設;疊入 pandapower 重跑潮流並做額定護欄,尚未接經濟(電池/回收)最佳化。",
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
    "潮流模型(pandapower)的拓樸/容量是手刻定義,Excel 規格表是另一份獨立來源。北電錶區已校正;南電錶區已建模但開發中、負載尚未校正。北+南合計 51 台 / 33,000 kVA,與 Excel 52 台 / 34,250 kVA 僅差 1 台(北電 N 棟少計);各區負載率/電壓仍以各自電錶區解讀。",
  rows: [
    { label: "變壓器台數", model: "51 台(北37+南14,另北2停用)", excel: "52 台", gap: true },
    { label: "裝置總容量", model: "33,000 kVA", excel: "34,250 kVA", gap: true },
    { label: "1000 kVA 機組", model: "8 台(南 E/H6/H1)", excel: "8 台", gap: false },
    { label: "200/250/500/600/1500 kVA 級距", model: "相符", excel: "相符", gap: false },
  ],
  missing: [
    { name: "N 棟(北電)", detail: "Excel 2 台、模型 1 台;北電少計 1 台(~1,250 kVA),待補容量/接線" },
    { name: "E/H6/H1/H2/O/U(南電)", detail: "原未建模,現已在南電錶模型(6 VCB / 14 台 / 11,000 kVA,開發中未校正)" },
  ],
  verifyNote:
    "E/H6/H1/H2/O/U 已確認屬南電錶並完成建模(開發中未校正);剩北電 N 棟 Excel 2 台 vs 模型 1 台待補(需 Excel/單線圖的容量與接線)。南電錶負載尚未對真實資料校正,南區負載率/電壓僅供參考。",
};

export interface VerifyItem { item: string; done: boolean; owner: string; impact: string; }

export const VERIFY: VerifyItem[] = [
  { item: "契約容量 3,250 kW", done: true, owner: "營繕組", impact: "全部需量 / 罰款計算的基準" },
  { item: "台電實際費率與合約條件", done: false, owner: "營繕組", impact: "校正電費與超約罰款" },
  { item: "實際超約罰款帳單", done: false, owner: "營繕組", impact: "對照估算 ~NT$ 231 萬/年準不準" },
  { item: "變壓器實際屆齡 / 廠牌年份", done: false, owner: "現場 / 財產清冊", impact: "核對汰換優先序" },
  { item: "學校 EUI 歷史申報值", done: false, owner: "營繕組", impact: "校正節能基準" },
  { item: "學期行事曆考試週 / 學期末確切日期", done: false, owner: "教務 / 營繕組", impact: "校正需量預測學期末降載(現僅含端午/清明連假)" },
  { item: "是否功因不足被罰", done: false, owner: "營繕組", impact: "決定是否新增功因防線" },
  { item: "E圖書資訊館 / H1·H6 宿舍等屬南電錶 → 已確認並完成建模", done: true, owner: "營繕組", impact: "南電錶拓樸/容量已入模型(14台/11,000kVA)" },
  { item: "北電 N 棟第 2 台變壓器(Excel 2 / 模型 1)補建", done: false, owner: "營繕組 / 單線圖", impact: "補上後北+南 = 52 台,與 Excel 完全對齊" },
  { item: "南電錶逐時負載 / 校正(拓樸已建,待對真實資料)", done: false, owner: "營繕組", impact: "南區負載率/電壓才可信,達成全校可用覆蓋" },
];

export interface RoadmapItem { title: string; status: "done" | "doing" | "planned"; note?: string; }

export const ROADMAP: RoadmapItem[] = [
  { title: "需量契約預警 + 卸載建議", status: "done" },
  { title: "契約容量最佳化", status: "done", note: "揭露超約 30%、削峰可省 ~231 萬" },
  { title: "時間電價電費試算", status: "done" },
  { title: "用電強度 EUI", status: "done" },
  { title: "設備汰換風險排序", status: "done" },
  { title: "歷史趨勢 + 互動單線圖", status: "done" },
  { title: "校園總覽日負載曲線:拖曳基準點看尖峰日各時段", status: "done", note: "基準改 EMS 實測尖峰日(2023/06/08, 4,220kW);拖曳即時連動 KPI/地圖/焦點" },
  { title: "驗證中心", status: "done" },
  { title: "微電網建模(C/D、Z 竣工圖):微電網頁 + 單線圖節點", status: "done", note: "下一步:規劃模擬儲能充放電/發電機控制、地圖圖示" },
  { title: "設備汰換投資回收(NT$/回收年限)", status: "done", note: "高風險群換新總額/年省/回收年限" },
  { title: "需量預測升級:行事曆 + 近期負載(逐週不同)", status: "done", note: "3–5月訓/6月驗 MAPE~20%;預測vs實際對照、點圖查逐時各饋線" },
  { title: "規劃模擬:地圖新增建物 → 疊入潮流 + 額定護欄", status: "done", note: "接法A(自受電匯流排新拉獨立饋線);變壓器/電纜過載、低壓白話警告" },
  { title: "登入權限(展示版,兩組帳號)", status: "done", note: "管理者 admin / 總務處使用者 ga;前端驗證,非真實安全" },
  { title: "擴充 EMS 月份(9–10月總量 / 7–8月暑假)", status: "planned", note: "9–10 僅總量需另建總量模型;補暑假才能預測整年" },
  { title: "功因罰款防線", status: "planned" },
  { title: "南電錶建模(全校覆蓋)", status: "planned" },
  { title: "即時 EMS 串接", status: "planned" },
  { title: "告警 LINE 推播", status: "planned" },
  { title: "V2 太陽能 + 儲能(綠能管理)", status: "planned" },
  { title: "規劃沙盒經濟層:電池 sizing / 契約可降 / 回收年限(PyPSA)", status: "planned", note: "接在新增建物/資產疊加之上,算投資回收" },
  { title: "正式後端帳密 / 權限角色(V2)", status: "planned", note: "取代現行展示版前端登入" },
];
