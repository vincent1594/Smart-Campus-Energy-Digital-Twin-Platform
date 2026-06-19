import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import WarRoomBackdrop from "./components/WarRoomBackdrop";
import WarRoomIntro from "./components/WarRoomIntro";
import AssetExplorer from "./pages/AssetExplorer";
import Alarms from "./pages/Alarms";
import BuildingExplorer from "./pages/BuildingExplorer";
import CampusMapPage from "./pages/CampusMapPage";
import DemandManagement from "./pages/DemandManagement";
import EnergyIntensity from "./pages/EnergyIntensity";
import HistoryTrends from "./pages/HistoryTrends";
import MapExplorer from "./pages/MapExplorer";
import Report from "./pages/Report";
import Scenario from "./pages/Scenario";
import VerificationCenter from "./pages/VerificationCenter";

const INTRO_KEY = "bg_intro_date";
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

export default function App() {
  // 「通電序列」開場一天只播一次(localStorage 記日期;頂部「重看開場」可重播)。
  const seen = localStorage.getItem(INTRO_KEY) === today();
  const [entered, setEntered] = useState(seen);
  const [showIntro, setShowIntro] = useState(!seen);   // 開場覆蓋層是否仍掛載
  const enter = () => { localStorage.setItem(INTRO_KEY, today()); setEntered(true); };

  return (
    <>
      {/* 儀表板:entered 後掛載,於開場淡出時於底下淡入(交叉融接,KPI 同步跳數) */}
      {entered && (
        <AppLayout>
          <Routes>
            <Route path="/" element={<MapExplorer />} />
            <Route path="/map" element={<CampusMapPage />} />
            <Route path="/buildings" element={<BuildingExplorer />} />
            <Route path="/assets" element={<AssetExplorer />} />
            <Route path="/scenario" element={<Scenario />} />
            <Route path="/demand" element={<DemandManagement />} />
            <Route path="/eui" element={<EnergyIntensity />} />
            <Route path="/history" element={<HistoryTrends />} />
            <Route path="/alarms" element={<Alarms />} />
            <Route path="/report" element={<Report />} />
            <Route path="/verify" element={<VerificationCenter />} />
          </Routes>
        </AppLayout>
      )}

      {/* 開場覆蓋層:enter 後淡出(.7s)再卸載,露出底下的儀表板 */}
      {showIntro && (
        <div style={{ position: "fixed", inset: 0, background: "#02030a", overflow: "hidden", zIndex: 1000,
          opacity: entered ? 0 : 1, transition: "opacity .7s ease", pointerEvents: entered ? "none" : "auto" }}
          onTransitionEnd={() => { if (entered) setShowIntro(false); }}>
          <WarRoomBackdrop />
          <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
            <WarRoomIntro onEnter={enter} />
          </div>
        </div>
      )}
    </>
  );
}
