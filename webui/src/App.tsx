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
import Placeholder from "./pages/Placeholder";
import SingleLineDiagram from "./pages/SingleLineDiagram";
import Report from "./pages/Report";
import Scenario from "./pages/Scenario";

export default function App() {
  // 進入網站先播「通電序列」開場;按進入後顯示平台。整頁重載會再播。
  const [entered, setEntered] = useState(false);

  if (!entered) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#02030a", overflow: "hidden" }}>
        <WarRoomBackdrop />
        <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
          <WarRoomIntro onEnter={() => setEntered(true)} />
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
        <Route path="/single-line" element={<SingleLineDiagram />} />
        <Route path="/monitor" element={<Placeholder title="即時監控（需時序資料,示意）" />} />
        <Route path="/history" element={<HistoryTrends />} />
        <Route path="/alarms" element={<Alarms />} />
        <Route path="/report" element={<Report />} />
      </Routes>
    </AppLayout>
  );
}
