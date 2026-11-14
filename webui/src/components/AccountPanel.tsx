// 帳號面板:點 header 的「總務處」展開。登入已移到開場登入卡 —— 進得來就代表已登入。
// 上:訪客統計(彙總,兩組帳號都可見);下:帳號 + 登出。
// 訪客 IP 明細 / 使用者回饋明細屬後台個資 → 僅管理者(admin)可見;總務處使用者顯示「僅管理者可見」。
import { Button, Divider, Rate, Tag, Tooltip } from "antd";
import { LogoutOutlined, UserOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { FeedbackList, RecentVisit, VisitStats } from "../api/types";

export default function AccountPanel() {
  const { role, isAdmin, logout } = useAuth();
  const [stats, setStats] = useState<VisitStats>();
  const [recent, setRecent] = useState<RecentVisit[]>([]);
  const [fb, setFb] = useState<FeedbackList>();

  useEffect(() => { api.visitStats().then(setStats).catch(() => undefined); }, []);
  // 訪客 IP / 回饋明細屬個資 → 僅管理者抓取
  useEffect(() => {
    if (!isAdmin) return;
    api.recentVisits(40).then(setRecent).catch(() => undefined);
    api.feedbackList(50).then(setFb).catch(() => undefined);
  }, [isAdmin]);

  const maxV = Math.max(1, ...(stats?.daily.map((d) => d.visits) ?? [1]));

  return (
    <div style={{ width: 270 }}>
      {/* 身分 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}><UserOutlined style={{ marginInlineEnd: 6 }} />總務處</span>
        <Tag color="green">已登入 · {role ?? "—"}</Tag>
      </div>

      {/* 訪客統計(彙總,兩組帳號皆可見) */}
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

      {/* 帳號 */}
      <Divider orientation="left" plain style={{ margin: "10px 0 8px", fontSize: 12 }}>帳號</Divider>
      <Button size="small" block icon={<LogoutOutlined />} onClick={logout}>登出</Button>

      {isAdmin ? (
        <>
          {/* 最近訪客 IP —— 僅管理者可見 */}
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
          <div style={{ fontSize: 10, color: "#bbb", marginTop: 6 }}>IP 屬個資,僅管理者可見。</div>

          {/* 使用者回饋(評分 + 留言)—— 僅管理者可見 */}
          <Divider orientation="left" plain style={{ margin: "12px 0 6px", fontSize: 12 }}>
            使用者回饋 <span style={{ color: "#bbb", fontWeight: 400 }}>({fb?.count ?? 0})</span>
          </Divider>
          {fb && fb.count > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: "#faad14", lineHeight: 1 }}>{fb.average.toFixed(1)}</span>
              <Rate disabled allowHalf value={fb.average} style={{ fontSize: 13 }} />
              <span style={{ fontSize: 11, color: "#999" }}>· {fb.count} 則</span>
            </div>
          )}
          <div style={{ maxHeight: 200, overflow: "auto", border: "1px solid #f0f0f0", borderRadius: 4 }}>
            {!fb || fb.items.length === 0 ? <div style={{ fontSize: 11, color: "#bbb", padding: "8px 10px" }}>尚無回饋</div>
              : fb.items.map((it, i) => (
                <div key={i} style={{ padding: "6px 8px", borderBottom: "1px solid #fafafa" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Rate disabled value={it.rating} style={{ fontSize: 11 }} />
                      {it.role && <Tag color="blue" style={{ margin: 0, fontSize: 10, lineHeight: "16px", padding: "0 5px" }}>{it.role}</Tag>}
                    </span>
                    <span style={{ fontSize: 10, color: "#bbb", whiteSpace: "nowrap" }}>{it.ts.slice(5, 16).replace("T", " ")}</span>
                  </div>
                  {it.comment && <div style={{ fontSize: 12, color: "#444", marginTop: 3, lineHeight: 1.5 }}>{it.comment}</div>}
                </div>
              ))}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 11, color: "#999", marginTop: 12, lineHeight: 1.6, background: "#fafafa", border: "1px solid #f0f0f0", borderRadius: 6, padding: "8px 10px" }}>
          訪客 IP 明細與使用者回饋屬後台個資,僅<b>管理者</b>可見。
        </div>
      )}
    </div>
  );
}
