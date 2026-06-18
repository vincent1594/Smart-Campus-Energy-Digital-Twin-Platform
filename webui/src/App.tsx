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

const INTRO_KEY = "bg_intro_seen";

export default function App() {
  // 「通電序列」開場一個 session 只播一次(頂部「重看開場」可重播)。
  const [entered, setEntered] = useState(() => sessionStorage.getItem(INTRO_KEY) === "1");

  if (!entered) {
    const enter = () => { sessionStorage.setItem(INTRO_KEY, "1"); setEntered(true); };
    return (
      <div style={{ position: "fixed", inset: 0, background: "#02030a", overflow: "hidden" }}>
        <WarRoomBackdrop />
        <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
          <WarRoomIntro onEnter={enter} />
        </div>
      </div>
    );
  }

  return (
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
      </Routes>
    </AppLayout>
  );
}
