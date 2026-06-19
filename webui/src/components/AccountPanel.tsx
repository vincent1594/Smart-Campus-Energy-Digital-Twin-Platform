// 帳號面板:點 header 的「總務處 admin」展開。
// 上:訪客統計(今日/累計 人數+次數 + 近 14 天迷你長條);下:登入表單(展示版)。
import { Button, Divider, Input, Tag, Tooltip, message } from "antd";
import { LogoutOutlined, UserOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { RecentVisit, VisitStats } from "../api/types";

// ⚠ 展示用前端驗證(非真實安全);正式帳密/權限角色為 V2(見驗證中心路線圖)。
const DEMO_USER = "admin";
const DEMO_PASS = "stust2026";

export default function AccountPanel() {
  const [stats, setStats] = useState<VisitStats>();
  const [acc, setAcc] = useState("");
  const [pwd, setPwd] = useState("");
  const [role, setRole] = useState<string | null>(() => localStorage.getItem("bg_role"));
  const [recent, setRecent] = useState<RecentVisit[]>([]);

  useEffect(() => { api.visitStats().then(setStats).catch(() => undefined); }, []);
  // 最近訪客 IP 屬個資 → 僅登入後才抓
  useEffect(() => { if (role) api.recentVisits(40).then(setRecent).catch(() => undefined); }, [role]);

  const login = () => {
    if (acc.trim() === DEMO_USER && pwd === DEMO_PASS) {
      localStorage.setItem("bg_role", "管理員");
      setRole("管理員"); setPwd("");
      message.success("已登入(展示)");
    } else {
      message.error("帳號或密碼錯誤");
    }
  };
  const logout = () => { localStorage.removeItem("bg_role"); setRole(null); };

  const maxV = Math.max(1, ...(stats?.daily.map((d) => d.visits) ?? [1]));

  return (
    <div style={{ width: 270 }}>
      {/* 身分 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}><UserOutlined style={{ marginInlineEnd: 6 }} />總務處</span>
        {role ? <Tag color="green">已登入 · {role}</Tag> : <Tag>未登入</Tag>}
      </div>

      {/* 訪客統計 */}
      <Divider orientation="left" plain style={{ margin: "6px 0 8px", fontSize: 12 }}>訪客統計</Divider>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        {[["今日", stats?.today_people, stats?.today_visits], ["累計", stats?.total_people, stats?.total_visits]].map(([label, ppl, vis]) => (
          <div key={String(label)} style={{ flex: 1, background: "#f5f8ff", border: "1px solid #e6f0ff", borderRadius: 6, padding: "6px 8px" }}>
            <div style={{ fontSize: 11, color: "#888" }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1677ff", lineHeight: 1.2 }}>{ppl ?? "—"}<span style={{ fontSize: 11, color: "#666", fontWeight: 400 }}> 人</span></div>
            <div style={{ fontSize: 11, color: "#999" }}>{vis ?? "—"} 次</div>
          </div>
        ))}
      </div>
      {/* 近 14 天迷你長條(高度=當日拜訪次數) */}
      {stats && (
        <>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 38, padding: "0 2px" }}>
            {stats.daily.map((d) => (
              <Tooltip key={d.day} title={`${d.day.slice(5)}:${d.visits} 次 / ${d.people} 人`}>
                <div style={{ flex: 1, height: `${4 + (d.visits / maxV) * 32}px`, background: d.day === stats.daily[stats.daily.length - 1].day ? "#1677ff" : "#91caff", borderRadius: 2, minWidth: 4 }} />
              </Tooltip>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "#bbb", textAlign: "right", marginTop: 2 }}>
            近 14 天拜訪{stats.since ? ` · 自 ${stats.since}` : ""}
          </div>
        </>
      )}

      {/* 登入 */}
      <Divider orientation="left" plain style={{ margin: "10px 0 8px", fontSize: 12 }}>{role ? "帳號" : "登入"}</Divider>
      {role ? (
        <>
          <Button size="small" block icon={<LogoutOutlined />} onClick={logout}>登出</Button>
          <Divider orientation="left" plain style={{ margin: "12px 0 6px", fontSize: 12 }}>
            最近訪客 IP <span style={{ color: "#bbb", fontWeight: 400 }}>({recent.length})</span>
          </Divider>
          <div style={{ maxHeight: 168, overflow: "auto", border: "1px solid #f0f0f0", borderRadius: 4 }}>
            {recent.length === 0 ? <div style={{ fontSize: 11, color: "#bbb", padding: "8px 10px" }}>尚無紀錄</div>
              : recent.map((r, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, padding: "4px 8px", borderBottom: "1px solid #fafafa" }}>
                  <span style={{ color: "#333", fontFamily: "monospace" }}>{r.ip ?? "—"}</span>
                  <span style={{ color: "#999", whiteSpace: "nowrap" }}>{r.ts.slice(5, 16).replace("T", " ")}</span>
                </div>
              ))}
          </div>
          <div style={{ fontSize: 10, color: "#bbb", marginTop: 6 }}>IP 屬個資,僅登入後可見。</div>
        </>
      ) : (
        <>
          <Input size="small" placeholder="帳號" prefix={<UserOutlined />} value={acc} onChange={(e) => setAcc(e.target.value)} style={{ marginBottom: 6 }} />
          <Input.Password size="small" placeholder="密碼" value={pwd} onChange={(e) => setPwd(e.target.value)} onPressEnter={login} style={{ marginBottom: 8 }} />
          <Button type="primary" size="small" block onClick={login}>登入</Button>
          <div style={{ fontSize: 10, color: "#bbb", marginTop: 8, lineHeight: 1.5 }}>
            展示用前端驗證,非真實安全。正式帳密與權限角色為 V2(見驗證中心路線圖)。
          </div>
        </>
      )}
    </div>
  );
}
