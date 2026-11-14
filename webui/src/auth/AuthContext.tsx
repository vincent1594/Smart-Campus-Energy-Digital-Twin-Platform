// 登入狀態(展示用前端驗證,非真實安全 —— 密碼寫死在前端,真後端驗證屬 V2)。
// 兩組帳號:管理者 admin(看得到訪客 IP/回饋等後台個資)、總務處使用者 ga(用功能但看不到個資)。
// 硬閘門:App 未登入不放行;登入狀態記在 localStorage(登一次就好,除非登出)。
import { createContext, useContext, useState, type ReactNode } from "react";

interface Account {
  pass: string;
  role: string;      // 顯示用角色名
  isAdmin: boolean;  // 是否可見後台個資(訪客 IP / 回饋明細)
}

const ACCOUNTS: Record<string, Account> = {
  admin: { pass: "stust2026", role: "管理者", isAdmin: true },
  ga: { pass: "stust2026", role: "總務處", isAdmin: false },
};

const USER_KEY = "bg_user";

interface AuthValue {
  user: string | null;
  role: string | null;
  isAdmin: boolean;
  authed: boolean;
  login: (user: string, pass: string) => boolean;
  logout: () => void;
}

const AuthCtx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null>(() => {
    const u = localStorage.getItem(USER_KEY);
    return u && ACCOUNTS[u] ? u : null;
  });

  const acc = user ? ACCOUNTS[user] : null;

  const login = (u: string, p: string): boolean => {
    const key = u.trim().toLowerCase();
    const a = ACCOUNTS[key];
    if (a && p === a.pass) {
      localStorage.setItem(USER_KEY, key);
      localStorage.removeItem("bg_role");   // 清掉單一 admin 時代的舊鍵
      setUser(key);
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem(USER_KEY);
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, role: acc?.role ?? null, isAdmin: !!acc?.isAdmin, authed: !!acc, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthValue {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth 必須在 AuthProvider 內使用");
  return v;
}
