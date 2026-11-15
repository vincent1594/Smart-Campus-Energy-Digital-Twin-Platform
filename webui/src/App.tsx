import { Suspense, lazy, useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { Spin } from "antd";
import { api } from "./api/client";
import { useAuth } from "./auth/AuthContext";
import AppLayout from "./components/AppLayout";
import LoginCard from "./components/LoginCard";
import WarRoomBackdrop from "./components/WarRoomBackdrop";
import WarRoomIntro from "./components/WarRoomIntro";
import MapExplorer from "./pages/MapExplorer";   // 首頁:維持即時載入(進場即顯示)

// 次要分頁懶載入 → 各自獨立 chunk,首屏不載、點到才下載
const AssetExplorer = lazy(() => import("./pages/AssetExplorer"));
const Alarms = lazy(() => import("./pages/Alarms"));
const BuildingExplorer = lazy(() => import("./pages/BuildingExplorer"));
const CampusMapPage = lazy(() => import("./pages/CampusMapPage"));
const DemandManagement = lazy(() => import("./pages/DemandManagement"));
const EnergyIntensity = lazy(() => import("./pages/EnergyIntensity"));
const HistoryTrends = lazy(() => import("./pages/HistoryTrends"));
const Microgrid = lazy(() => import("./pages/Microgrid"));
const Report = lazy(() => import("./pages/Report"));
const Scenario = lazy(() => import("./pages/Scenario"));
const VerificationCenter = lazy(() => import("./pages/VerificationCenter"));

const INTRO_KEY = "bg_intro_date";
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

export default function App() {
  const { authed } = useAuth();   // 硬閘門:未登入不放行(登入卡浮在開場動畫上)
  // 開場一天只播一次;但唯有「已登入 且 今天看過」才可直接跳過開場進場。
  const seen = localStorage.getItem(INTRO_KEY) === today();
  const canSkip = authed && seen;
  const [entered, setEntered] = useState(canSkip);
  const [showIntro, setShowIntro] = useState(!canSkip);   // 開場覆蓋層是否仍掛載
  const enter = () => { localStorage.setItem(INTRO_KEY, today()); setEntered(true); };

  // 記錄拜訪:一載入網頁就記(不論有沒有點進開場),每 session 一次。
  useEffect(() => {
    let vid = localStorage.getItem("bg_visitor_id");
    if (!vid) { vid = (crypto.randomUUID?.() ?? String(Math.random()).slice(2)); localStorage.setItem("bg_visitor_id", vid); }
    if (!sessionStorage.getItem("bg_visited")) {
      sessionStorage.setItem("bg_visited", "1");
      api.recordVisit(vid).catch(() => undefined);
    }
  }, []);

  return (
    <>
      <style>{"@keyframes bgDashEnter{from{opacity:0;transform:scale(1.035)}to{opacity:1;transform:none}}"}</style>

      {/* 儀表板:entered 後掛載;由開場進來時從微放大收回 + 淡入(鏡頭落定,KPI 同步跳數) */}
      {entered && (
        <div style={{ height: "100vh", animation: seen ? undefined : "bgDashEnter .85s cubic-bezier(.2,.7,.2,1) both" }}>
          <AppLayout>
            <Suspense fallback={<Spin size="large" style={{ display: "block", margin: "120px auto" }} />}>
              <Routes>
                <Route path="/" element={<MapExplorer />} />
                <Route path="/map" element={<CampusMapPage />} />
                <Route path="/buildings" element={<BuildingExplorer />} />
                <Route path="/assets" element={<AssetExplorer />} />
                <Route path="/scenario" element={<Scenario />} />
                <Route path="/demand" element={<DemandManagement />} />
                <Route path="/microgrid" element={<Microgrid />} />
                <Route path="/eui" element={<EnergyIntensity />} />
                <Route path="/history" element={<HistoryTrends />} />
                <Route path="/alarms" element={<Alarms />} />
                <Route path="/report" element={<Report />} />
                <Route path="/verify" element={<VerificationCenter />} />
              </Routes>
            </Suspense>
          </AppLayout>
        </div>
      )}

      {/* 開場覆蓋層:enter 後「往中心推進 + 淡出」(.85s),像鏡頭穿過開場落進儀表板 */}
      {showIntro && (
        <div style={{ position: "fixed", inset: 0, background: "#02030a", overflow: "hidden", zIndex: 1000,
          opacity: entered ? 0 : 1, transform: entered ? "scale(1.14)" : "none", transformOrigin: "50% 52%",
          transition: "opacity .85s ease, transform .85s cubic-bezier(.4,0,.6,1)", pointerEvents: entered ? "none" : "auto" }}
          onTransitionEnd={(e) => { if (entered && e.propertyName === "opacity") setShowIntro(false); }}>
          <WarRoomBackdrop />
          <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
            {/* 未登入:動畫背景跑,但藏起自己的進入/略過鈕,由登入卡當唯一入口 */}
            <WarRoomIntro onEnter={enter} showEnter={authed} />
          </div>
          {/* 硬閘門:未登入 → 浮登入卡;登入成功即放行進場(接開場運鏡) */}
          {!authed && !entered && <LoginCard onSuccess={enter} />}
        </div>
      )}
    </>
  );
}
