// 固定校園地圖:純 CSS 疊圖。標記預設透明(不遮地圖),支援「焦點 + 高亮群組」連動:
//  focusLetter = 目前關注的棟(藍實心)
//  highlight   = 同供電群 / 受影響的棟(藍框),其餘變淡
// 右上「顯示負載」開關可改疊彩色負載率環。圓點隨容器縮放永遠對齊棟位。
import { Switch } from "antd";
import { useState } from "react";
import { BUILDING_POS, MAP_H, MAP_IMAGE, MAP_W, ratioColor } from "../lib/campusPositions";

export interface MapMarker {
  letter: string;
  name: string;
  ratio: number | null;
}

export default function CampusMapStatic({
  markers,
  focusLetter,
  highlight,
  onSelect,
}: {
  markers: MapMarker[];
  focusLetter?: string | null;
  highlight?: Set<string>;
  onSelect?: (letter: string) => void;
}) {
  const [showLoad, setShowLoad] = useState(false);
  const hasFocus = !!focusLetter || (highlight?.size ?? 0) > 0;

  return (
    <div style={{ position: "relative", width: "100%", lineHeight: 0 }}>
      <style>{`.campus-marker{transition:transform .12s, box-shadow .12s; background:transparent;}
        .campus-marker:hover{transform:scale(1.25); box-shadow:0 0 0 2px rgba(22,119,255,.55), 0 0 6px rgba(0,0,0,.3);}`}</style>

      <img src={MAP_IMAGE} alt="校園地圖" style={{ width: "100%", display: "block", borderRadius: 8 }} />

      <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(255,255,255,.85)", borderRadius: 6, padding: "2px 8px", zIndex: 10 }}>
        <span style={{ fontSize: 12, marginInlineEnd: 6 }}>顯示負載</span>
        <Switch size="small" checked={showLoad} onChange={setShowLoad} />
      </div>

      {markers.map((m) => {
        const p = BUILDING_POS[m.letter];
        if (!p) return null;
        const c = ratioColor(m.ratio);
        const isFocus = m.letter === focusLetter;
        const isHi = !!highlight?.has(m.letter);
        const size = isFocus ? 32 : 26;

        let border = "2px solid transparent";
        let background = "transparent";
        if (isFocus) { border = "4px solid #1677ff"; background = "rgba(22,119,255,.40)"; }
        else if (isHi) { border = "3px solid #1677ff"; background = "rgba(22,119,255,.18)"; }
        else if (showLoad) { border = `3px solid ${c.border}`; }

        const dim = hasFocus && !isFocus && !isHi;
        const outline = isFocus || isHi || showLoad ? "0 0 0 1.5px rgba(255,255,255,.9)" : "none";

        return (
          <div key={m.letter} style={{ position: "absolute", left: `${(p.x / MAP_W) * 100}%`, top: `${(p.y / MAP_H) * 100}%`, transform: "translate(-50%, -50%)", zIndex: isFocus ? 7 : isHi ? 5 : 3, opacity: dim ? 0.2 : 1 }}>
            <button
              className="campus-marker"
              onClick={() => onSelect?.(m.letter)}
              title={`${m.letter}棟 ${m.name}${m.ratio != null ? `｜負載率 ${m.ratio.toFixed(0)}%` : ""}`}
              style={{ width: size, height: size, borderRadius: "50%", border, background, boxShadow: outline, cursor: "pointer", padding: 0 }}
            />
          </div>
        );
      })}
    </div>
  );
}
