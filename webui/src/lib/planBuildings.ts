// 規劃建物(規劃模擬「what-if 新增建物」草稿)。
// 此版純前端:使用者在地圖上擺一棟、點進去填電氣規格,存 localStorage(依電網分開)。
// 尚未接潮流/PyPSA —— 欄位刻意對齊未來 /plan/simulate 的 diff 物件,之後接引擎不用改結構。
import { useCallback, useEffect, useRef, useState } from "react";
import type { Pt } from "./campusPositions";

// 一台變壓器(掛在規劃建物下)。
export interface PlanTransformer {
  id: string;
  capacity_kva: number;   // 容量 kVA
  lv_voltage: number;     // 低壓側 0.22 / 0.38 kV
  load_kw: number;        // 這台帶的負載 kW
  pf: number;             // 功率因數
}

// 一棟規劃建物 = 幾何(地圖多邊形)+ 電氣接法(接哪個 VCB、電纜多長、幾台變壓器)。
export interface PlanBuilding {
  id: string;
  name: string;
  usage: string;          // 用途 key(對應 USAGE_OPTIONS)
  poly: Pt[];             // 多邊形(MAP_W×MAP_H 座標,與 BUILDING_POS 同一空間)
  vcb: string | null;     // 接哪個 VCB(此版只存代號,不驗證、不做就近建議)
  cableLength_m: number;  // 自饋線 tap 到本站的電纜長度
  transformers: PlanTransformer[];
}

// 用途 → 相對負載密度(對齊 data/area_loads.py 的 BUILDING_DENSITY)。
export const USAGE_OPTIONS = [
  { value: "teach", label: "教學行政", density: 15 },
  { value: "lab", label: "實驗/工程", density: 18 },
  { value: "food", label: "生活餐飲", density: 20 },
  { value: "dorm", label: "宿舍", density: 12 },
  { value: "sport", label: "體育", density: 8 },
  { value: "special", label: "特殊", density: 12 },
];

// 台電常見變壓器容量級距(與模型內 250/400/500 等一致)。
export const KVA_OPTIONS = [100, 150, 200, 250, 300, 400, 500, 750, 1000];
export const LV_OPTIONS = [0.22, 0.38];

// 規劃建物在地圖上的識別色(紫,與負載率熱力/焦點藍區隔)。
export const PLAN_COLOR = "#722ed1";

// 點擊處生一個預設矩形(4 點),中心對齊點擊座標。
export function defaultPoly([x, y]: Pt): Pt[] {
  const w = 104, h = 58;
  const r = (n: number) => Math.round(n);
  return [
    [r(x - w / 2), r(y - h / 2)],
    [r(x + w / 2), r(y - h / 2)],
    [r(x + w / 2), r(y + h / 2)],
    [r(x - w / 2), r(y + h / 2)],
  ];
}

function nextNum(items: PlanBuilding[]): number {
  let max = 0;
  for (const it of items) {
    const m = /^plan-(\d+)$/.exec(it.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

// 在點擊處造一棟預設規劃建物(帶一台預設變壓器)。
export function newPlanBuilding(at: Pt, existing: PlanBuilding[]): PlanBuilding {
  const n = nextNum(existing);
  const id = `plan-${n}`;
  return {
    id,
    name: `規劃建物 ${n}`,
    usage: "teach",
    poly: defaultPoly(at),
    vcb: null,
    cableLength_m: 100,
    transformers: [
      { id: `${id}-tr1`, capacity_kva: 500, lv_voltage: 0.38, load_kw: 300, pf: 0.9 },
    ],
  };
}

// 在既有清單上,替某棟新增一台變壓器(容量沿用最後一台,序號續接)。
export function appendTransformer(b: PlanBuilding): PlanTransformer[] {
  const nums = b.transformers.map((t) => Number(/-tr(\d+)$/.exec(t.id)?.[1] ?? 0));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  const last = b.transformers[b.transformers.length - 1];
  return [
    ...b.transformers,
    { id: `${b.id}-tr${n}`, capacity_kva: last?.capacity_kva ?? 500, lv_voltage: last?.lv_voltage ?? 0.38, load_kw: 0, pf: 0.9 },
  ];
}

const KEY = (net: string) => `bayesgrid.planBuildings.${net}`;

// 規劃建物狀態(依電網存 localStorage;切電網自動載入該網的清單)。
export function usePlanBuildings(net: string) {
  const [items, setItems] = useState<PlanBuilding[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY(net));
      setItems(raw ? (JSON.parse(raw) as PlanBuilding[]) : []);
    } catch {
      setItems([]);
    }
  }, [net]);

  // 用 ref 讓 add/update/remove 讀到最新清單,回呼身分又保持穩定。
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const persist = useCallback((next: PlanBuilding[]) => {
    setItems(next);
    try {
      localStorage.setItem(KEY(net), JSON.stringify(next));
    } catch {
      /* 私密瀏覽/配額滿:略過持久化,記憶體狀態仍可用 */
    }
  }, [net]);

  const add = useCallback((b: PlanBuilding) => persist([...itemsRef.current, b]), [persist]);
  const update = useCallback(
    (id: string, patch: Partial<PlanBuilding>) => persist(itemsRef.current.map((it) => (it.id === id ? { ...it, ...patch } : it))),
    [persist],
  );
  const remove = useCallback((id: string) => persist(itemsRef.current.filter((it) => it.id !== id)), [persist]);

  return { items, add, update, remove };
}
