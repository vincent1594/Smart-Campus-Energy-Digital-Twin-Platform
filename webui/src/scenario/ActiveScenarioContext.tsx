// 全站「目前套用的情境結果」。校園總覽(KPI/地圖/焦點)據此覆蓋顯示;null = 顯示現況(base)。
// kind 區分:'whatif' = 規劃模擬(改負載/容量…,標「模擬情境」);'time' = 日曲線時段檢視(尖峰日基準,不算模擬)。
// net = 情境所屬電網(北/南);多電網下「分別連動」:總覽只在「目前電網 === 情境電網」時套用,跨網顯示現況。
import { createContext, useContext, useState, type ReactNode } from "react";
import { getNetwork } from "../api/client";
import type { PowerFlowResult } from "../api/types";

export type ScenarioKind = "whatif" | "time" | null;

const Ctx = createContext<{
  scenario: PowerFlowResult | null;
  scenarioKind: ScenarioKind;
  scenarioNet: string | null;
  setScenario: (r: PowerFlowResult | null, kind?: ScenarioKind, net?: string) => void;
}>({
  scenario: null,
  scenarioKind: null,
  scenarioNet: null,
  setScenario: () => {},
});

export function ActiveScenarioProvider({ children }: { children: ReactNode }) {
  const [scenario, setScen] = useState<PowerFlowResult | null>(null);
  const [scenarioKind, setKind] = useState<ScenarioKind>(null);
  const [scenarioNet, setNet] = useState<string | null>(null);
  // 設定情境時記下它所屬電網(預設為目前電網),供總覽「分別連動」判斷。
  const setScenario = (r: PowerFlowResult | null, kind: ScenarioKind = "whatif", net: string = getNetwork()) => {
    setScen(r);
    setKind(r ? kind : null);
    setNet(r ? net : null);
  };
  return <Ctx.Provider value={{ scenario, scenarioKind, scenarioNet, setScenario }}>{children}</Ctx.Provider>;
}

export function useActiveScenario() {
  return useContext(Ctx);
}

// 「分別連動」:只有當情境所屬電網 === 指定電網(預設目前電網)時才回傳情境,否則視為現況(null)。
// 讓北電網的模擬不會誤套到南電網的總覽,反之亦然;切回原電網即重新顯示其情境。
export function useNetScenario(net: string = getNetwork()) {
  const ctx = useActiveScenario();
  const on = ctx.scenario != null && ctx.scenarioNet === net;
  return { ...ctx, scenario: on ? ctx.scenario : null, scenarioKind: on ? ctx.scenarioKind : null };
}
