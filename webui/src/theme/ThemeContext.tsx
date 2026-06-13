// 深 / 淺主題:淺色=日常工作台,深色=戰情大屏展示模式。資料與焦點共用,只換呈現。
import { createContext, useContext, useState, type ReactNode } from "react";

const Ctx = createContext<{ dark: boolean; setDark: (v: boolean) => void }>({ dark: false, setDark: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false);
  return <Ctx.Provider value={{ dark, setDark }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
