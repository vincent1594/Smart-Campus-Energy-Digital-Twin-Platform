// 變壓器額定電壓(銘牌)與台電 ±10% 法規容許範圍
// 二次側額定電壓對照(線/相),來源:各站變壓器規格容量資料.xlsx
// lv_kv(線電壓 kV) → 顯示用線/相電壓(V)
const LV_SPEC: Record<string, { line: number; phase?: number }> = {
  "0.38": { line: 380, phase: 220 }, // 380/220V 三相四線
  "0.22": { line: 220 },             // 220V
  "0.208": { line: 208, phase: 120 },// 208/120V
  "0.19": { line: 190, phase: 110 }, // 190/110V
  "0.11": { line: 110 },             // 110V
};

export const TPC_TOLERANCE = 0.1; // 台電供電電壓容許範圍 ±10%

// 額定值 → ±10% 範圍字串,例如 220 → "198–242"
export function rangeV(nominalV: number): string {
  const lo = Math.round(nominalV * (1 - TPC_TOLERANCE));
  const hi = Math.round(nominalV * (1 + TPC_TOLERANCE));
  return `${lo}–${hi}`;
}

// 一次側 11.4kV 的 ±10% 範圍,例如 "10.26–12.54"
export function rangeKV(nominalKV: number): string {
  const lo = (nominalKV * (1 - TPC_TOLERANCE)).toFixed(2);
  const hi = (nominalKV * (1 + TPC_TOLERANCE)).toFixed(2);
  return `${lo}–${hi}`;
}

// 由 lv_kv 取得二次側額定電壓資訊
export function lvSpec(lvKv: number): { line: number; phase?: number } {
  return LV_SPEC[String(lvKv)] ?? { line: Math.round(lvKv * 1000) };
}

// 二次側額定電壓顯示字串,例如 "380/220 V"、"220 V"
export function lvLabel(lvKv: number): string {
  const s = lvSpec(lvKv);
  return s.phase ? `${s.line}/${s.phase} V` : `${s.line} V`;
}

// 二次側允許範圍字串(線/相各自 ±10%),例如 "線 342–418 / 相 198–242 V"
export function lvRangeLabel(lvKv: number): string {
  const s = lvSpec(lvKv);
  return s.phase
    ? `線 ${rangeV(s.line)} / 相 ${rangeV(s.phase)} V`
    : `${rangeV(s.line)} V`;
}
