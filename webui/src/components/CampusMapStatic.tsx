// 校園地圖(照片底 + SVG 多邊形疊圖)。各棟為「不規則多邊形」,發光描邊依負載率,中心透明。
// 顯示:focusLetter/highlight 連動、dark 深色發光、showConnectors 受電站→棟連線。
// 編輯(editable):拖頂點移動、雙擊多邊形邊加頂點、雙擊頂點刪除;onPolyChange 回拋。
import { useEffect, useRef, useState } from "react";
import { BUILDING_POS, MAP_H, MAP_IMAGE, MAP_W, type Pt, centroid, ratioColor } from "../lib/campusPositions";

export interface MapMarker {
  letter: string;
  name: string;
  ratio: number | null;
  net?: string;   // 全校園總覽:此建物所屬系統 (north/south),用於外框識別色
}

function distSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  const cx = a[0] + t * dx, cy = a[1] + t * dy;
  return Math.hypot(p[0] - cx, p[1] - cy);
}

export default function CampusMapStatic({
  markers, focusLetter, highlight, emphasize, sourceLetter, onSelect, onClear, dark = false,
  editable = false, polys, onPolyChange, fitHeight = false, outage = false, hideLegend = false,
  systemBorder, systemLegend,
}: {
  markers: MapMarker[];
  focusLetter?: string | null;
  highlight?: Set<string>;
  emphasize?: Set<string>;   // 在 highlight 之上「再強調」的子群(例:點受電站建物 H1 → 全系統淡亮,H1 同 VCB 群再加深)
  sourceLetter?: string | null;   // 供電源(受電站):焦點為其他棟時,以金色標出電源 + 連線,與「同群」藍色區隔
  onSelect?: (letter: string) => void;
  onClear?: () => void;   // 點地圖空白處 → 取消選取
  dark?: boolean;
  editable?: boolean;
  polys?: Record<string, Pt[]>;
  onPolyChange?: (letter: string, pts: Pt[]) => void;
  fitHeight?: boolean; // 依高度縮放(置中、不溢出)
  outage?: boolean;    // 停電影響模式:highlight 棟別改用紅色亮起(聚焦 VCB 時)
  hideLegend?: boolean; // 隱藏右下角圖例(負載率色階 / 停電影響)
  systemBorder?: Record<string, string>;  // 全校園總覽:net→外框色,各建物依所屬系統畫識別外框
  systemLegend?: { label: string; color: string }[];  // 全校園總覽:左上角系統圖例
}) {
  const ref = useRef<HTMLDivElement>(null);          // 內層(會被縮放/平移)
  const outerRef = useRef<HTMLDivElement>(null);     // 外層(裁切視窗)
  const drag = useRef<{ letter: string; idx: number; last?: Pt } | null>(null);  // idx=-1 → 整塊平移
  const pan = useRef<{ cx: number; cy: number; tx: number; ty: number } | null>(null);  // 編輯模式拖空白處平移畫布
  const POS = polys ?? BUILDING_POS;
  const hasFocus = !!focusLetter || (highlight?.size ?? 0) > 0;
  const accent = dark ? "#00e5ff" : "#1677ff";

  // 編輯模式畫布視圖:s=縮放倍率、tx/ty=平移(外層容器 px)。非編輯模式恆為 1×。
  const [view, setView] = useState({ s: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  const setVw = (v: { s: number; tx: number; ty: number }) => { viewRef.current = v; setView(v); };
  const ZMAX = 6;
  const clampView = (s: number, tx: number, ty: number, W: number, H: number) => {
    s = Math.max(1, Math.min(ZMAX, s));
    tx = Math.max(W * (1 - s), Math.min(0, tx));   // 邊界:不讓地圖被拖出視窗
    ty = Math.max(H * (1 - s), Math.min(0, ty));
    return { s, tx, ty };
  };
  // 以容器內某點 (cx,cy) 為錨點縮放(滾輪指向、按鈕對中心)
  const zoomAt = (factor: number, cx: number, cy: number, W: number, H: number) => {
    const v = viewRef.current;
    const ns = Math.max(1, Math.min(ZMAX, v.s * factor));
    const X = (cx - v.tx) / v.s, Y = (cy - v.ty) / v.s;
    setVw(clampView(ns, cx - ns * X, cy - ns * Y, W, H));
  };
  const zoomCenter = (factor: number) => {
    const el = outerRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    zoomAt(factor, r.width / 2, r.height / 2, r.width, r.height);
  };

  const toImg = (e: PointerEvent | React.MouseEvent): Pt => {
    // 內層 ref 已套用 transform,getBoundingClientRect 即為「縮放後」矩形,直接等比換算即得圖座標。
    const r = ref.current!.getBoundingClientRect();
    return [(e.clientX - r.left) * (MAP_W / r.width), (e.clientY - r.top) * (MAP_H / r.height)];
  };

  // 進/出編輯模式都重設視圖,避免殘留縮放
  useEffect(() => { setVw({ s: 1, tx: 0, ty: 0 }); }, [editable]);

  // 滾輪縮放(指向游標);需非被動監聽才能 preventDefault 阻止頁面捲動
  useEffect(() => {
    if (!editable) return;
    const el = outerRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [editable]);

  useEffect(() => {
    if (!editable) return;
    const mv = (e: PointerEvent) => {
      if (pan.current) {
        const el = outerRef.current; if (!el) return;
        const r = el.getBoundingClientRect();
        const p = pan.current;
        setVw(clampView(viewRef.current.s, p.tx + (e.clientX - p.cx), p.ty + (e.clientY - p.cy), r.width, r.height));
        return;
      }
      const d = drag.current; if (!d || !POS[d.letter]) return;
      const cur = toImg(e);
      if (d.idx === -1) {
        // 整塊平移:依游標位移量搬移多邊形所有頂點
        const last = d.last ?? cur;
        const dx = cur[0] - last[0], dy = cur[1] - last[1];
        const np = POS[d.letter].map((p) => [Math.round(p[0] + dx), Math.round(p[1] + dy)] as Pt);
        d.last = cur;
        onPolyChange?.(d.letter, np);
      } else {
        const np = POS[d.letter].map((p, i) => (i === d.idx ? (cur.map(Math.round) as Pt) : p));
        onPolyChange?.(d.letter, np);
      }
    };
    const up = () => { drag.current = null; pan.current = null; };
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
    <div ref={outerRef}
      style={{ position: "relative", overflow: editable ? "hidden" : "visible", touchAction: editable ? "none" : undefined,
        ...(fitHeight ? { width: "100%", height: "100%" } : { width: "100%" }) }}
      onPointerDown={editable ? (e) => {
        // 點在空白處(多邊形/頂點會 stopPropagation)→ 平移畫布
        pan.current = { cx: e.clientX, cy: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty };
      } : undefined}>
    <div ref={ref} style={{ position: "relative", lineHeight: 0, transformOrigin: "0 0",
      ...(editable ? { transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`, cursor: "grab" } : {}),
      ...(fitHeight ? { width: "100%", height: "100%" } : { width: "100%" }) }}>
      <img src={MAP_IMAGE} alt="校園地圖" draggable={false} style={{ display: "block", borderRadius: 8, filter: dark ? "brightness(.5) contrast(1.15) saturate(.35) grayscale(.5)" : "saturate(.16) brightness(1.08)", ...(fitHeight ? { width: "100%", height: "100%", objectFit: "fill" } : { width: "100%" }) }} />

      {/* 全校園總覽:系統識別圖例(左上;外框色=所屬系統) */}
      {!editable && systemLegend && systemLegend.length > 0 && (
        <div style={{ position: "absolute", left: 8, top: 8, zIndex: 20, display: "flex", alignItems: "center", gap: 10,
          background: dark ? "rgba(0,0,0,.5)" : "rgba(255,255,255,.86)", color: dark ? "#cfe9ff" : "#666",
          borderRadius: 6, padding: "3px 9px", fontSize: 11, lineHeight: 1.6, boxShadow: "0 1px 4px rgba(0,0,0,.12)" }}>
          {systemLegend.map((s) => (
            <span key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 12, height: 9, borderRadius: 2, border: `2px solid ${s.color}`, display: "inline-block" }} />{s.label}
            </span>
          ))}
        </div>
      )}

      {/* 圖例:停電影響模式顯示紅色「受影響棟」,否則顯示負載率色階 */}
      {!editable && !hideLegend && (
        <div style={{ position: "absolute", right: 8, bottom: 8, zIndex: 20, display: "flex", alignItems: "center", gap: 10,
          background: dark ? "rgba(0,0,0,.5)" : "rgba(255,255,255,.86)", color: dark ? "#cfe9ff" : "#666",
          borderRadius: 6, padding: "3px 9px", fontSize: 11, lineHeight: 1.6, boxShadow: "0 1px 4px rgba(0,0,0,.12)" }}>
          {outage ? (
            <>
              <span style={{ color: dark ? "#5f86a8" : "#999" }}>停電影響</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: "#ff4d4f", display: "inline-block" }} />受影響棟(停電)
              </span>
            </>
          ) : (
            <>
              <span style={{ color: dark ? "#5f86a8" : "#999" }}>負載率</span>
              {[["#52c41a", "正常"], ["#fadb14", "中載"], ["#fa8c16", "吃緊"], ["#ff4d4f", "過載"]].map(([col, lab]) => (
                <span key={lab} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: col, display: "inline-block" }} />{lab}
                </span>
              ))}
            </>
          )}
        </div>
      )}

      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="none"
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
        {/* 焦點棟描邊呼吸光暈:柔和脈動,引導視線(不影響點擊) */}
        {!editable && focusLetter && POS[focusLetter] && (
          <polygon className="cms-focus-glow" points={POS[focusLetter].map((p) => p.join(",")).join(" ")}
            fill="none" stroke={accent} strokeWidth={3} strokeLinejoin="round" filter="url(#cmsGlow)" pointerEvents="none" />
        )}

        {/* 各棟:多邊形(預設依負載率淡色填,無框無字);編輯模式才顯示框與頂點 */}
        {markers.map((m) => {
          const pts = POS[m.letter]; if (!pts) return null;
          const c = ratioColor(m.ratio);
          const cen = centroid(pts);
          const isFocus = m.letter === focusLetter;
          const isHi = !!highlight?.has(m.letter);
          const isEmph = !editable && !!emphasize?.has(m.letter);   // 強調子群(同饋線)
          const showShape = editable;   // 僅編輯模式顯示範圍框與字母
          // 全校園總覽:非編輯時依所屬系統畫識別外框(填色仍為負載率)
          const sysStroke = !editable && systemBorder && m.net ? systemBorder[m.net] : null;
          const emphActive = !editable && (emphasize?.size ?? 0) > 0;   // 有強調子群(點受電站建物)
          let stroke = "transparent", fill = "transparent";
          if (showShape) {
            if (editable) { stroke = accent; fill = "rgba(22,119,255,.18)"; }
            else if (isFocus) { stroke = accent; fill = "rgba(22,119,255,.3)"; }
            else if (isHi) { stroke = accent; fill = "rgba(22,119,255,.12)"; }
            else { stroke = c.border; fill = `${c.bg}${dark ? "33" : "55"}`; }
          } else if (!editable) {
            // 預設:無框柔和熱力填。底圖已壓近灰階,負載色不與彩照混色,稍提不透明度即可辨。
            // outage(聚焦 VCB):受影響棟以紅色明顯亮起,讀作「會一同停電」。
            // 兩段式(僅用填色深淺,不畫框):焦點最深 → 強調群(同饋線)次之 → 其餘高亮(整系統)最淡。
            // 有強調子群時把「整系統」壓更淡,讓 H1/H2 靠對比跳出來;一般點選維持原本亮度。
            fill = isFocus ? `${accent}4d`
              : isEmph ? `${accent}3d`
              : isHi ? (outage ? "#ff4d4f80" : `${accent}${emphActive ? "12" : "1f"}`)
              : `${c.bg}${dark ? "4d" : "66"}`;
          }
          return (
            <g key={m.letter} style={{ cursor: editable ? "grab" : "pointer" }}>
              <title>{editable ? `拖曳移動整個 ${m.letter} 範圍;拖頂點改形狀;雙擊邊加點、雙擊點刪點`
                              : `${m.letter}棟 ${m.name}${m.ratio != null ? `｜負載率 ${m.ratio.toFixed(0)}%` : ""}`}</title>
              <polygon points={pts.map((p) => p.join(",")).join(" ")} fill={fill} stroke={showShape ? stroke : (sysStroke ?? "none")} strokeWidth={sysStroke ? 3 : (isFocus ? 5 : 4)}
                style={editable ? { cursor: "grab" } : undefined}
                onClick={editable ? undefined : () => onSelect?.(m.letter)}
                onPointerDown={editable ? (e) => {
                  e.stopPropagation();
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  drag.current = { letter: m.letter, idx: -1, last: toImg(e) };  // 整塊平移
                } : undefined}
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

        {/* 供電源(受電站):焦點為其他棟時,以紫色色塊標出電從哪來(畫在各棟填色「之上」,
            才不會被受電站自身的灰色負載率填色蓋掉 — 北 X 純受電站不在高亮群尤其明顯)。
            受電站本身即焦點時不重複標。pointerEvents=none 讓點擊穿透到底下可選取。 */}
        {!editable && hasFocus && sourceLetter && sourceLetter !== focusLetter && POS[sourceLetter] && (
          <polygon points={POS[sourceLetter].map((p) => p.join(",")).join(" ")} fill="#9254de" fillOpacity={0.55} stroke="none" pointerEvents="none" />
        )}
      </svg>
    </div>

      {/* 編輯模式縮放控制:滾輪指向縮放、拖空白處平移,按鈕對中心縮放 / 重設 */}
      {editable && (
        <div onPointerDown={(e) => e.stopPropagation()}
          style={{ position: "absolute", left: 8, bottom: 8, zIndex: 30, display: "flex", alignItems: "center", gap: 6,
            background: "rgba(255,255,255,.92)", borderRadius: 8, padding: "4px 6px", boxShadow: "0 1px 4px rgba(0,0,0,.18)" }}>
          {([["＋", 1.3], ["－", 1 / 1.3]] as [string, number][]).map(([lab, f]) => (
            <button key={lab} onClick={() => zoomCenter(f)}
              style={{ width: 26, height: 26, border: "1px solid #d9d9d9", borderRadius: 6, background: "#fff",
                cursor: "pointer", fontSize: 16, lineHeight: 1, color: "#333" }}>{lab}</button>
          ))}
          <button onClick={() => setVw({ s: 1, tx: 0, ty: 0 })}
            style={{ height: 26, padding: "0 8px", border: "1px solid #d9d9d9", borderRadius: 6, background: "#fff",
              cursor: "pointer", fontSize: 12, color: "#333" }}>重設</button>
          <span style={{ fontSize: 11, color: "#999", marginLeft: 2 }}>{view.s.toFixed(1)}× · 滾輪縮放/拖空白平移</span>
        </div>
      )}
    </div>
  );
}
