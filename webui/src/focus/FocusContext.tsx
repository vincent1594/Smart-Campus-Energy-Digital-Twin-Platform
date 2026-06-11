// 全站「焦點」—— 貫穿所有頁面的「目前關注對象」。任何頁選取設備/建築都更新它,
// 換頁時保留,讓「發現→查→評估→紀錄」成為一條動線。
import { createContext, useContext, useState, type ReactNode } from "react";

export type FocusKind = "building" | "transformer" | "vcb" | "feeder" | "source";
export interface Focus {
  kind: FocusKind;
  id: string;
  label?: string;
}

export const kindLabel: Record<FocusKind, string> = {
  building: "建築",
  transformer: "變壓器",
  vcb: "VCB",
  feeder: "饋線",
  source: "受電站",
};

const Ctx = createContext<{ focus: Focus | null; setFocus: (f: Focus | null) => void }>({
  focus: null,
  setFocus: () => {},
});

export function FocusProvider({ children }: { children: ReactNode }) {
  const [focus, setFocus] = useState<Focus | null>(null);
  return <Ctx.Provider value={{ focus, setFocus }}>{children}</Ctx.Provider>;
}

export function useFocus() {
  return useContext(Ctx);
}
