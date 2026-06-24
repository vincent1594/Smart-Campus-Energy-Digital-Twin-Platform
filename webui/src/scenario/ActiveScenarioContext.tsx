// 全站「目前套用的情境結果」。校園總覽(KPI/地圖/焦點)據此覆蓋顯示;null = 顯示現況(base)。
// kind 區分:'whatif' = 規劃模擬(改負載/容量…,標「模擬情境」);'time' = 日曲線時段檢視(尖峰日基準,不算模擬)。
import { createContext, useContext, useState, type ReactNode } from "react";
import type { PowerFlowResult } from "../api/types";

export type ScenarioKind = "whatif" | "time" | null;

const Ctx = createContext<{
  scenario: PowerFlowResult | null;
  scenarioKind: ScenarioKind;
  setScenario: (r: PowerFlowResult | null, kind?: ScenarioKind) => void;
}>({
  scenario: null,
  scenarioKind: null,
  setScenario: () => {},
});

export function ActiveScenarioProvider({ children }: { children: ReactNode }) {
  const [scenario, setScen] = useState<PowerFlowResult | null>(null);
  const [scenarioKind, setKind] = useState<ScenarioKind>(null);
  const setScenario = (r: PowerFlowResult | null, kind: ScenarioKind = "whatif") => {
    setScen(r);
    setKind(r ? kind : null);
  };
  return <Ctx.Provider value={{ scenario, scenarioKind, setScenario }}>{children}</Ctx.Provider>;
}

export function useActiveScenario() {
  return useContext(Ctx);
}
