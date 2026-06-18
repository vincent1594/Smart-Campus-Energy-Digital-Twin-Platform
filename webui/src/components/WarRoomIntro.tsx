// 戰情室開場英雄動畫「通電序列」(電網版發射)— 電影級編排:
// ① 特寫受電站 X 蓄能 → ② 點火爆光 + 放射火花 + 水平鏡頭光斑 →
// ③ 鏡頭隨能量波「拉遠揭示」整座校園(各棟在被揭示時序列點火、衝擊環)→
// ④ 100% 瞬間 全螢幕白光爆閃 + 衝擊波 + 標題重擊 → ⑤ 全網同步心跳脈動 + 前景餘燼。
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import type { BuildingSummary, PowerFlowResult } from "../api/types";
import { BUILDING_POS, MAP_H, MAP_IMAGE, MAP_W, buildingLetter, centroid, type Pt } from "../lib/campusPositions";

const SURGE = 0.95;       // 點火時刻(秒)
const WAVE_SPEED = 470;   // 能量波速(校園座標單位 / 秒)
const CAM_DUR = 3.1;      // 鏡頭拉遠時長(秒)
const CAM_START = 2.5;    // 開場特寫倍率
const MONO = "'Roboto Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

function flowColor(ratio: number | null): string {
  if (ratio == null) return "#3ad07a";
  if (ratio > 100) return "#ff5247";
  if (ratio >= 80) return "#ffb43a";
  if (ratio >= 50) return "#5fa8ff";
  return "#3ad07a";
}

interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number }
interface Ember { x: number; y: number; r: number; vy: number; tw: number; ph: number; warm: boolean }

export default function WarRoomIntro({ onEnter }: { onEnter: () => void }) {
  const [pf, setPf] = useState<PowerFlowResult>();
  const [buildings, setBuildings] = useState<BuildingSummary[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const burstRef = useRef<{ done: boolean; parts: Spark[] }>({ done: false, parts: [] });
  const embersRef = useRef<Ember[]>([]);

  useEffect(() => { const im = new Image(); im.src = MAP_IMAGE; imgRef.current = im; }, []);
  useEffect(() => { Promise.all([api.powerflow(), api.buildings()]).then(([p, b]) => { setPf(p); setBuildings(b); }).catch(() => {}); }, []);

  const scene = useMemo(() => {
    const [sx, sy] = centroid(BUILDING_POS.X ?? [[220, 263]]);
    const ratioOf = new Map<string, number | null>();
    if (pf) {
      const tr = new Map(pf.transformer_loadings.map((t) => [t.transformer_id, t.load_ratio_percent]));
      buildings.forEach((b) => {
        const L = buildingLetter(b.id);
        if (!ratioOf.has(L)) ratioOf.set(L, null);
        const r = tr.get(b.transformer_name);
        if (r != null) ratioOf.set(L, Math.max(ratioOf.get(L) ?? 0, r));
      });
    }
    const nodes = Object.keys(BUILDING_POS).filter((L) => L !== "X").map((L, i) => {
      const [cx, cy] = centroid(BUILDING_POS[L]);
      return { L, cx, cy, dist: Math.hypot(cx - sx, cy - sy), color: flowColor(ratioOf.get(L) ?? null), poly: BUILDING_POS[L] as Pt[], hash: (i * 0.173) % 1 };
    });
    return { sx, sy, nodes, maxDist: Math.max(...nodes.map((n) => n.dist), 1) };
  }, [pf, buildings]);

  const sceneRef = useRef(scene);
  useEffect(() => { sceneRef.current = scene; }, [scene]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    let raf = 0, W = 0, H = 0, dpr = 1, start = 0;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      if (!embersRef.current.length) {
        embersRef.current = Array.from({ length: 40 }, () => ({
          x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.8, vy: 0.004 + Math.random() * 0.01,
          tw: 0.5 + Math.random() * 1.5, ph: Math.random() * 6.28, warm: Math.random() < 0.4,
        }));
      }
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(canvas);

    const draw = (ts: number) => {
      raf = requestAnimationFrame(draw);
      if (!start) start = ts;
      const e = (ts - start) / 1000;
      const dt = 0.016;
      const { sx, sy, nodes, maxDist } = sceneRef.current;
      const energT = SURGE + maxDist / WAVE_SPEED;   // 全亮時刻

      ctx.save(); ctx.scale(dpr, dpr);
      const bg = ctx.createRadialGradient(W / 2, H * 0.46, 0, W / 2, H * 0.5, Math.max(W, H) * 0.8);
      bg.addColorStop(0, "#050a14"); bg.addColorStop(1, "#010206");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      const sX = W / MAP_W, sY = H / MAP_H;           // 填滿整個畫面
      const TX = (x: number) => x * sX, TY = (y: number) => y * sY;
      const SXc = TX(sx), SYc = TY(sy);

      // === 鏡頭:特寫 X → 拉遠揭示 ===
      ctx.save();
      const cp = easeOut(Math.min(e / CAM_DUR, 1));
      const cz = CAM_START - (CAM_START - 1) * cp;
      ctx.translate(SXc, SYc); ctx.scale(cz, cz); ctx.translate(-SXc, -SYc);

      const img = imgRef.current;
      if (img && img.complete && img.naturalWidth) {
        ctx.globalAlpha = Math.min(0.14, Math.max(0, (e - 0.3) / 2.2));
        ctx.filter = "grayscale(1) brightness(1.8)";
        ctx.drawImage(img, 0, 0, W, H);
        ctx.filter = "none"; ctx.globalAlpha = 1;
      }

      const waveR = Math.max(0, e - SURGE) * WAVE_SPEED;
      let litCount = 0;

      for (const n of nodes) {
        const cx = TX(n.cx), cy = TY(n.cy);
        const charged = Math.max(0, Math.min(1, waveR / n.dist));
        const igniteT = SURGE + n.dist / WAVE_SPEED;
        const lit = e >= igniteT;
        if (lit) litCount++;
        const flash = lit ? Math.max(0, 1 - (e - igniteT) / 0.55) : 0;

        ctx.strokeStyle = "rgba(130,150,185,0.10)"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(SXc, SYc); ctx.lineTo(cx, cy); ctx.stroke();
        if (charged > 0) {
          const px = SXc + (cx - SXc) * charged, py = SYc + (cy - SYc) * charged;
          ctx.strokeStyle = n.color; ctx.lineWidth = 1.8; ctx.globalAlpha = 0.82 + Math.random() * 0.18;
          ctx.shadowBlur = 10; ctx.shadowColor = n.color;
          ctx.beginPath(); ctx.moveTo(SXc, SYc); ctx.lineTo(px, py); ctx.stroke();
          ctx.shadowBlur = 0; ctx.globalAlpha = 1;
          if (charged < 1) {
            ctx.shadowBlur = 18; ctx.shadowColor = "#ffffff"; ctx.fillStyle = "#ffffff";
            ctx.beginPath(); ctx.arc(px, py, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
          }
        }
        if (lit) {
          const ringP = Math.min(1, (e - igniteT) / 0.45);
          if (ringP < 1) {
            ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - ringP)})`; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(cx, cy, 4 + ringP * 22, 0, Math.PI * 2); ctx.stroke();
          }
          ctx.beginPath();
          n.poly.forEach((p, i) => { const X = TX(p[0]), Y = TY(p[1]); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
          ctx.closePath();
          ctx.fillStyle = n.color; ctx.globalAlpha = 0.12 + flash * 0.4; ctx.fill();
          ctx.globalAlpha = 1; ctx.strokeStyle = n.color; ctx.lineWidth = 1.4 + flash * 1.8;
          ctx.shadowBlur = 6 + flash * 26; ctx.shadowColor = n.color; ctx.stroke(); ctx.shadowBlur = 0;
          if (charged >= 1) {
            for (let s = 0; s < 2; s++) {
              const ph = (e * 0.32 + s * 0.5 + n.hash) % 1;
              const fx = SXc + (cx - SXc) * ph, fy = SYc + (cy - SYc) * ph;
              ctx.shadowBlur = 12; ctx.shadowColor = n.color; ctx.fillStyle = n.color;
              ctx.beginPath(); ctx.arc(fx, fy, 1.8, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
            }
          }
          const la = Math.min(1, (e - igniteT) / 0.4);
          ctx.globalAlpha = la; ctx.fillStyle = "#dfe8f2"; ctx.font = `13px ${MONO}`; ctx.textAlign = "center";
          ctx.fillText(n.L, cx, cy - 8); ctx.globalAlpha = 1;
        }
      }

      // 能量波(雙環,橢圓配合非等比)
      for (let w = 0; w < 2; w++) {
        const wr = waveR - w * 60;
        if (wr > 0 && wr < maxDist + 240) {
          const a = Math.max(0, (0.55 - w * 0.25) * (1 - wr / (maxDist + 240)));
          ctx.strokeStyle = `rgba(120,180,255,${a})`; ctx.lineWidth = 2 - w * 0.7;
          ctx.shadowBlur = 24; ctx.shadowColor = "rgba(120,180,255,0.7)";
          ctx.beginPath(); ctx.ellipse(SXc, SYc, wr * sX, wr * sY, 0, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
        }
      }

      // 全網同步心跳(全亮後)
      if (e > energT + 0.5) {
        const hb = (e - energT - 0.5) % 2.6;
        if (hb < 1.5) { const hr = hb * 950, a = 0.42 * (1 - hb / 1.5);
          ctx.strokeStyle = `rgba(120,200,255,${a})`; ctx.lineWidth = 2.4; ctx.shadowBlur = 18; ctx.shadowColor = "rgba(120,200,255,0.6)";
          ctx.beginPath(); ctx.ellipse(SXc, SYc, hr * sX, hr * sY, 0, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0; }
      }

      // 點火放射火花
      const b = burstRef.current;
      if (!b.done && e >= SURGE) {
        b.done = true;
        for (let i = 0; i < 40; i++) { const ang = Math.random() * Math.PI * 2; const sp = 260 + Math.random() * 720;
          b.parts.push({ x: sx, y: sy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0.95, max: 0.95 }); }
      }
      for (const p of b.parts) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.95; p.vy *= 0.95; p.life -= dt;
        if (p.life <= 0) continue;
        const a = p.life / p.max;
        ctx.globalAlpha = a; ctx.shadowBlur = 8; ctx.shadowColor = "#bfe0ff"; ctx.fillStyle = "#dcebff";
        ctx.beginPath(); ctx.arc(TX(p.x), TY(p.y), 1.8 * a + 0.4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
      b.parts = b.parts.filter((p) => p.life > 0);

      // 水平鏡頭光斑(點火瞬間,加成)
      const flare = Math.max(0, 1 - Math.abs(e - SURGE) / 0.5);
      if (flare > 0) {
        ctx.globalCompositeOperation = "lighter";
        const fg = ctx.createLinearGradient(SXc - W, SYc, SXc + W, SYc);
        fg.addColorStop(0, "rgba(120,180,255,0)"); fg.addColorStop(0.5, `rgba(180,215,255,${0.5 * flare})`); fg.addColorStop(1, "rgba(120,180,255,0)");
        ctx.fillStyle = fg; ctx.fillRect(SXc - W, SYc - 2.5 - flare * 3, W * 2, 5 + flare * 6);
        ctx.globalCompositeOperation = "source-over";
      }

      // 受電站 X
      if (e < SURGE) { const c0 = e / SURGE; ctx.strokeStyle = `rgba(120,180,255,${0.5 * c0})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(SXc, SYc, 6 + (1 - c0) * 40, 0, Math.PI * 2); ctx.stroke(); }
      const surge = Math.max(0, 1 - Math.abs(e - SURGE) / 0.45);
      const coreR = 5 + surge * 20 + Math.sin(e * 4) * 1.2;
      ctx.shadowBlur = 22 + surge * 50; ctx.shadowColor = "#9cc8ff"; ctx.fillStyle = "#5fa8ff";
      ctx.beginPath(); ctx.arc(SXc, SYc, coreR, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(SXc, SYc, 2.5 + surge * 3, 0, Math.PI * 2); ctx.fill();
      if (e > 0.4) { ctx.globalAlpha = Math.min(1, (e - 0.4) / 0.5); ctx.fillStyle = "#9ccbff"; ctx.font = `14px ${MONO}`; ctx.textAlign = "center";
        ctx.fillText("X · 受電站 · 台電 11.4kV", SXc, SYc - 24); ctx.globalAlpha = 1; }

      ctx.restore();   // 結束鏡頭

      // === 螢幕層 ===
      // 高潮:全螢幕白光爆閃 + 衝擊波
      const fl = e >= energT ? Math.max(0, 1 - (e - energT) / 0.55) : 0;
      if (fl > 0) { ctx.fillStyle = `rgba(255,255,255,${fl * 0.82})`; ctx.fillRect(0, 0, W, H); }
      const sw = e - energT;
      if (sw > 0 && sw < 0.85) { const a = 1 - sw / 0.85; ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 3 * a + 1;
        ctx.beginPath(); ctx.arc(W / 2, H / 2, sw * 1700, 0, Math.PI * 2); ctx.stroke(); }

      // 前景餘燼(景深)
      for (const em of embersRef.current) {
        em.y -= em.vy * dt; if (em.y < -0.02) em.y += 1.04;
        const a = 0.5 * (0.5 + 0.5 * Math.sin(e * em.tw + em.ph));
        ctx.globalAlpha = a; ctx.fillStyle = em.warm ? "#ffd9a0" : "#bcd6ff";
        ctx.beginPath(); ctx.arc(em.x * W, em.y * H, em.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 暗角
      const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.max(W, H) * 0.72);
      vig.addColorStop(0, "rgba(0,0,0,0)"); vig.addColorStop(1, "rgba(0,0,0,0.62)");
      ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

      // 通電進度遙測
      if (e > SURGE - 0.1) {
        const pct = nodes.length ? litCount / nodes.length : 0;
        const bw = 300, bx = W / 2 - bw / 2, by = 30;
        ctx.globalAlpha = Math.min(1, (e - (SURGE - 0.1)) / 0.4);
        ctx.fillStyle = "#7db8ff"; ctx.font = `12px ${MONO}`; ctx.textAlign = "left";
        ctx.fillText(pct >= 1 ? "● ALL SYSTEMS NOMINAL · 全線帶電" : "SYSTEM ENERGIZING · 送電中", bx, by - 8);
        ctx.strokeStyle = "rgba(120,160,220,0.5)"; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, 6);
        ctx.fillStyle = pct >= 1 ? "#3ad07a" : "#5fa8ff"; ctx.shadowBlur = 10; ctx.shadowColor = ctx.fillStyle;
        ctx.fillRect(bx, by, bw * pct, 6); ctx.shadowBlur = 0;
        ctx.fillStyle = "#cfe2ff"; ctx.textAlign = "right"; ctx.font = `13px ${MONO}`;
        ctx.fillText(`${Math.round(pct * 100)}%`, bx + bw + 38, by + 6);
        ctx.globalAlpha = 1;
      }

      ctx.restore();
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0, background: "#010206" }}>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
      <style>{`
        @keyframes wrIntroTitle { 0% { opacity: 0; transform: scale(1.22); letter-spacing: 22px } 60% { opacity: 1 } 100% { opacity: 1; transform: scale(1); letter-spacing: 8px } }
        @keyframes wrIntroBtn { to { opacity: 1; transform: none } }
      `}</style>
      <a onClick={onEnter} style={{ position: "absolute", top: 22, right: 26, color: "#7c848e", fontFamily: MONO, fontSize: 12, letterSpacing: 2, cursor: "pointer" }}>略過 SKIP ▸</a>

      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", paddingBottom: "9%", pointerEvents: "none" }}>
        <div style={{ opacity: 0, animation: "wrIntroTitle 0.9s cubic-bezier(.2,.8,.2,1) 3.4s forwards", textAlign: "center" }}>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: 8, textShadow: "0 0 40px #1677ffcc", color: "#eaf2ff" }}>GRID ENERGIZED</div>
          <div style={{ fontSize: 18, letterSpacing: 6, color: "#9ccbff", marginTop: 6 }}>北電錶 · 全線帶電</div>
        </div>
        <button onClick={onEnter} style={{
          marginTop: 28, opacity: 0, transform: "translateY(8px)", animation: "wrIntroBtn 0.7s ease 4.6s forwards", pointerEvents: "auto",
          background: "rgba(95,168,255,0.10)", border: "1px solid rgba(120,180,255,0.5)", color: "#cfe2ff", fontFamily: MONO,
          fontSize: 15, letterSpacing: 3, padding: "11px 30px", cursor: "pointer", borderRadius: 2,
        }}>進入系統 ▸</button>
      </div>
    </div>
  );
}
