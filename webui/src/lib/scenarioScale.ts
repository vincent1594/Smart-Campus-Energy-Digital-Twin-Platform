// 設備查詢「情境連動」共用工具。
// 設備查詢各分頁原為 base 基準值;當有套用情境 (what-if / 日曲線時段) 時,
// 以「情境負載率 / 基準負載率」當縮放係數,把連接負載 kW 與負載率帶到情境值。
// 結構/容量 (連接哪些設備、kVA) 不縮放,維持 base。
import type { PowerFlowResult } from "../api/types";

// 變壓器 / 饋線 的情境負載率對照 (id → %);無情境回空 Map。
export function trafoRatioMap(scenario: PowerFlowResult | null): Map<string, number> {
  return new Map(scenario?.transformer_loadings.map((t) => [t.transformer_id, t.load_ratio_percent]) ?? []);
}
export function feederRatioMap(scenario: PowerFlowResult | null): Map<string, number> {
  return new Map(scenario?.feeder_loadings.map((f) => [f.feeder_id, f.load_ratio_percent]) ?? []);
}

// 縮放係數 = 情境率 / 基準率;缺情境率、或基準率 ≤ 0 → 1 (避免除零/暴衝)。
export function loadScale(scenarioRatio: number | undefined, baseRatio: number | null | undefined): number {
  if (scenarioRatio == null || baseRatio == null || baseRatio <= 0) return 1;
  return scenarioRatio / baseRatio;
}
