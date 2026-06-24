// 校園地圖(照片底 + SVG 多邊形疊圖)。各棟為「不規則多邊形」,發光描邊依負載率,中心透明。
// 顯示:focusLetter/highlight 連動、dark 深色發光、showConnectors 受電站→棟連線。
// 編輯(editable):拖頂點移動、雙擊多邊形邊加頂點、雙擊頂點刪除;onPolyChange 回拋。
import { useEffect, useRef } from "react";
import { BUILDING_POS, MAP_H, MAP_IMAGE, MAP_W, type Pt, centroid, ratioColor } from "../lib/campusPositions";

export interface MapMarker {
  letter: string;
  name: string;
  ratio: number | null;
}

function distSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  const cx = a[0] + t * dx, cy = a[1] + t * dy;
  return Math.hypot(p[0] - cx, p[1] - cy);
}

export default function CampusMapStatic({
  markers, focusLetter, highlight, sourceLetter, onSelect, onClear, dark = false,
  editable = false, polys, onPolyChange, fitHeight = false,
}: {
  markers: MapMarker[];
  focusLetter?: string | null;
  highlight?: Set<string>;
  sourceLetter?: string | null;   // 供電源(受電站):焦點為其他棟時,以金色標出電源 + 連線,與「同群」藍色區隔
  onSelect?: (letter: string) => void;
  onClear?: () => void;   // 點地圖空白處 → 取消選取
  dark?: boolean;
  editable?: boolean;
  polys?: Record<string, Pt[]>;
  onPolyChange?: (letter: string, pts: Pt[]) => void;
  fitHeight?: boolean; // 依高度縮放(置中、不溢出)
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ letter: string; idx: number } | null>(null);
  const POS = polys ?? BUILDING_POS;
  const hasFocus = !!focusLetter || (highlight?.size ?? 0) > 0;
  const accent = dark ? "#00e5ff" : "#1677ff";

  const toImg = (e: PointerEvent | React.MouseEvent): Pt => {
    const r = ref.current!.getBoundingClientRect();
    if (fitHeight) {
      // contain:圖片等比置中、可能有 letterbox,需扣掉縮放與留白偏移
      const s = Math.min(r.width / MAP_W, r.height / MAP_H);
      const offX = (r.width - MAP_W * s) / 2, offY = (r.height - MAP_H * s) / 2;
      return [(e.clientX - r.left - offX) / s, (e.clientY - r.top - offY) / s];
    }
    return [(e.clientX - r.left) * (MAP_W / r.width), (e.clientY - r.top) * (MAP_H / r.height)];
  };

  useEffect(() => {
    if (!editable) return;
    const mv = (e: PointerEvent) => {
      const d = drag.current; if (!d || !POS[d.letter]) return;
      const np = POS[d.letter].map((p, i) => (i === d.idx ? (toImg(e).map(Math.round) as Pt) : p));
      onPolyChange?.(d.letter, np);
    };
    const up = () => { drag.current = null; };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
  }, [editable, POS, onPolyChange]);

  const addVertex = (letter: string, pts: Pt[], at: Pt) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < pts.length; i++) { const d = distSeg(at, pts[i], pts[(i + 1) % pts.length]); if (d < bd) { bd = d; best = i; } }
    const np = [...pts]; np.splice(best + 1, 0, [Math.round(at[0]), Math.round(at[1])]);
    onPolyChange?.(letter, np);
  };

  return (
    <div ref={ref} style={{ position: "relative", lineHeight: 0, touchAction: editable ? "none" : undefined, ...(fitHeight ? { width: "100%", height: "100%" } : { width: "100%" }) }}>
      <img src={MAP_IMAGE} alt="校園地圖" draggable={false} style={{ display: "block", borderRadius: 8, filter: dark ? "brightness(.5) contrast(1.15) saturate(.35) grayscale(.5)" : "saturate(.16) brightness(1.08)", ...(fitHeight ? { width: "100%", height: "100%", objectFit: "contain" } : { width: "100%" }) }} />

      {/* 負載率色階圖例 */}
      {!editable && (
        <div style={{ position: "absolute", right: 8, bottom: 8, zIndex: 20, display: "flex", alignItems: "center", gap: 10,
          background: dark ? "rgba(0,0,0,.5)" : "rgba(255,255,255,.86)", color: dark ? "#cfe9ff" : "#666",
          borderRadius: 6, padding: "3px 9px", fontSize: 11, lineHeight: 1.6, boxShadow: "0 1px 4px rgba(0,0,0,.12)" }}>
          <span style={{ color: dark ? "#5f86a8" : "#999" }}>負載率</span>
          {[["#52c41a", "正常"], ["#fadb14", "中載"], ["#fa8c16", "吃緊"], ["#ff4d4f", "過載"]].map(([col, lab]) => (
            <span key={lab} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: col, display: "inline-block" }} />{lab}
            </span>
          ))}
        </div>
      )}

      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio={fitHeight ? "xMidYMid meet" : "none"}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <defs>
          <filter id="cmsGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          {/* 羽化邊緣,讓聚光燈挖洞柔順 */}
          <filter id="cmsSoft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="8" /></filter>
          {/* 聚光燈遮罩:白=暗幕生效,黑=挖洞(該棟保持明亮) */}
          <mask id="cmsSpot">
            <rect x={0} y={0} width={MAP_W} height={MAP_H} fill="#fff" />
            <g filter="url(#cmsSoft)">
              {markers.filter((m) => (m.letter === focusLetter || highlight?.has(m.letter) || m.letter === sourceLetter) && POS[m.letter]).map((m) => (
                <polygon key={"mk" + m.letter} points={POS[m.letter].map((p) => p.join(",")).join(" ")} fill="#000" />
              ))}
            </g>
          </mask>
        </defs>

        {/* 背景:點空白處取消選取(編輯模式不啟用) */}
        {!editable && (
          <rect x={0} y={0} width={MAP_W} height={MAP_H} fill="transparent"
            style={{ cursor: "default" }} onClick={() => onClear?.()} />
        )}

        {/* 聚光燈:其餘變暗,只有焦點棟+同供電群保持明亮全彩 */}
        {!editable && hasFocus && (
          <rect x={0} y={0} width={MAP_W} height={MAP_H} fill="#0a1830" opacity={0.58} mask="url(#cmsSpot)" pointerEvents="none" />
        )}
        {/* 焦點棟:一抹柔和色光,與同群區分 */}
        {!editable && focusLetter && POS[focusLetter] && (
          <polygon points={POS[focusLetter].map((p) => p.join(",")).join(" ")} fill={accent} opacity={0.14} pointerEvents="none" />
        )}
        {/* 供電源(受電站):焦點為其他棟時,以紫色色塊填 X棟標出電從哪來(與負載率色/焦點藍區隔)。X 本身即焦點時不重複標 */}
        {!editable && hasFocus && sourceLetter && sourceLetter !== focusLetter && POS[sourceLetter] && (
          <polygon points={POS[sourceLetter].map((p) => p.join(",")).join(" ")} fill="#9254de" fillOpacity={0.5} pointerEvents="none" />
        )}

        {/* 各棟:多邊形(預設依負載率淡色填,無框無字);編輯模式才顯示框與頂點 */}
        {markers.map((m) => {
          const pts = POS[m.letter]; if (!pts) return null;
          const c = ratioColor(m.ratio);
          const cen = centroid(pts);
          const isFocus = m.letter === focusLetter;
          const isHi = !!highlight?.has(m.letter);
          const showShape = editable;   // 僅編輯模式顯示範圍框與字母
          let stroke = "transparent", fill = "transparent";
          if (showShape) {
            if (editable) { stroke = accent; fill = "rgba(22,119,255,.18)"; }
            else if (isFocus) { stroke = accent; fill = "rgba(22,119,255,.3)"; }
            else if (isHi) { stroke = accent; fill = "rgba(22,119,255,.12)"; }
            else { stroke = c.border; fill = `${c.bg}${dark ? "33" : "55"}`; }
          } else if (!editable) {
            // 預設:無框柔和熱力填。底圖已壓近灰階,負載色不與彩照混色,稍提不透明度即可辨。
            fill = isFocus ? `${accent}33` : isHi ? `${accent}1f` : `${c.bg}${dark ? "4d" : "66"}`;
          }
          return (
            <g key={m.letter} style={{ cursor: editable ? "default" : "pointer" }}>
              <title>{`${m.letter}棟 ${m.name}${m.ratio != null ? `｜負載率 ${m.ratio.toFixed(0)}%` : ""}`}</title>
              <polygon points={pts.map((p) => p.join(",")).join(" ")} fill={fill} stroke={showShape ? stroke : "none"} strokeWidth={isFocus ? 5 : 4}
                onClick={editable ? undefined : () => onSelect?.(m.letter)}
                onDoubleClick={editable ? (e) => { e.stopPropagation(); addVertex(m.letter, pts, toImg(e)); } : undefined} />
              {showShape && (
                <text x={cen[0]} y={cen[1]} textAnchor="middle" dominantBaseline="central" fontSize={26} fontWeight={700}
                  fill="#fff" stroke="rgba(0,0,0,.6)" strokeWidth={1} pointerEvents="none">{m.letter}</text>
              )}
              {editable && pts.map((p, i) => (
                <circle key={i} cx={p[0]} cy={p[1]} r={9} fill="#fff" stroke={accent} strokeWidth={3} style={{ cursor: "grab" }}
                  onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { letter: m.letter, idx: i }; }}
                  onDoubleClick={(e) => { e.stopPropagation(); if (pts.length > 3) onPolyChange?.(m.letter, pts.filter((_, j) => j !== i)); }} />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
