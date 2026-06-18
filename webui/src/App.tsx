import { Route, Routes } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import AssetExplorer from "./pages/AssetExplorer";
import Alarms from "./pages/Alarms";
import BuildingExplorer from "./pages/BuildingExplorer";
import CampusMapPage from "./pages/CampusMapPage";
import DemandManagement from "./pages/DemandManagement";
import MapExplorer from "./pages/MapExplorer";
import Placeholder from "./pages/Placeholder";
import Report from "./pages/Report";
import Scenario from "./pages/Scenario";

export default function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<MapExplorer />} />
        <Route path="/map" element={<CampusMapPage />} />
        <Route path="/buildings" element={<BuildingExplorer />} />
        <Route path="/assets" element={<AssetExplorer />} />
        <Route path="/scenario" element={<Scenario />} />
        <Route path="/demand" element={<DemandManagement />} />
        <Route path="/single-line" element={<Placeholder title="單線圖總覽" />} />
        <Route path="/monitor" element={<Placeholder title="即時監控（需時序資料,示意）" />} />
        <Route path="/history" element={<Placeholder title="歷史趨勢（需時序資料,示意）" />} />
        <Route path="/alarms" element={<Alarms />} />
        <Route path="/report" element={<Report />} />
      </Routes>
    </AppLayout>
  );
}
