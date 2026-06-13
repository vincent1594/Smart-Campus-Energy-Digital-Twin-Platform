// 全站「目前套用的模擬情境結果」。規劃模擬執行後寫入,校園總覽(KPI/地圖)據此覆蓋顯示;
// null = 顯示現況(base)。
import { createContext, useContext, useState, type ReactNode } from "react";
import type { PowerFlowResult } from "../api/types";

const Ctx = createContext<{ scenario: PowerFlowResult | null; setScenario: (r: PowerFlowResult | null) => void }>({
  scenario: null,
  setScenario: () => {},
});

export function ActiveScenarioProvider({ children }: { children: ReactNode }) {
  const [scenario, setScenario] = useState<PowerFlowResult | null>(null);
  return <Ctx.Provider value={{ scenario, setScenario }}>{children}</Ctx.Provider>;
}

export function useActiveScenario() {
  return useContext(Ctx);
}
