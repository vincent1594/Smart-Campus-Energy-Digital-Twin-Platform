// 開場英雄動畫「電網傳輸序列」(送電版,非發射)— 電影級編排,雙受電站:
// ① 特寫北電網受電站 X:台電 11.4kV 進線受電、電壓爬升(收束電流匯入)→
// ② 北電網併網送電:能量波自 X 沿真實饋線往外傳輸 + 放射火花 + 鏡頭光斑 →
// ③ 鏡頭隨送電波「拉遠揭示」整座校園 → 南電網受電站 H1 接力點火、送電南半校區 →
// ④ 100% 全線帶電:全螢幕白光 + 衝擊波 + 標題 → ⑤ 全網同步心跳脈動 + 前景餘燼。
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import type { BuildingSummary, PowerFlowResult, TransformerDetail } from "../api/types";
import { BUILDING_POS, MAP_H, MAP_IMAGE, MAP_W, NET_NAME, SOURCE_LETTER_BY_NET, buildingLetter, centroid, type Pt } from "../lib/campusPositions";

const SURGE = 3.0;        // 首站(北 X)併網送電時刻(秒)— 延後以醞釀「受電爬升」過程
const STAGGER = 1.5;      // 第二站(南 H1)接力延遲(秒)— 待鏡頭拉遠揭示南半校區再點火
const WAVE_SPEED = 470;   // 能量波速(校園座標單位 / 秒)
const CAM_DUR = 3.4;      // 鏡頭拉遠時長(秒)
const CAM_START = 2.5;    // 開場特寫倍率
const MONO = "'Roboto Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

// 開場登場的電網(依序點火):北電網(台電主受電)→ 南電網接力。
const INTRO_NETS = ["north", "south"] as const;

function flowColor(ratio: number | null): string {
  if (ratio == null) return "#3ad07a";
  if (ratio > 100) return "#ff5247";
  if (ratio >= 80) return "#ffb43a";
  if (ratio >= 50) return "#5fa8ff";
  return "#3ad07a";
}

interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number }
interface Ember { x: number; y: number; r: number; vy: number; tw: number; ph: number; warm: boolean }
interface NetData { pf?: PowerFlowResult; buildings: BuildingSummary[]; trafos: TransformerDetail[]; vcbCount: number }
interface SourceV { net: string; letter: string; sx: number; sy: number; surgeT: number; maxDist: number; totalKw: number }
interface NodeV { L: string; cx: number; cy: number; igniteDist: number; color: string; poly: Pt[]; hash: number; srcIdx: number }

export default function WarRoomIntro({ onEnter }: { onEnter: () => void }) {
  const [data, setData] = useState<Record<string, NetData>>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const burstRef = useRef<{ done: Set<number>; parts: Spark[] }>({ done: new Set(), parts: [] });
  const embersRef = useRef<Ember[]>([]);

  useEffect(() => { const im = new Image(); im.src = MAP_IMAGE; imgRef.current = im; }, []);
  // 兩網資料各自獨立抓取、互不阻塞:某網不可用(如南電網開發中)時該受電站不入鏡,其餘照常。
  useEffect(() => {
    INTRO_NETS.forEach(async (net) => {
      try {
        const [pf, buildings, trafos, vcbs] = await Promise.all([api.powerflowOf(net), api.buildingsOf(net), api.transformersOf(net), api.vcbsOf(net)]);
        setData((d) => ({ ...d, [net]: { pf, buildings, trafos, vcbCount: vcbs.length } }));
      } catch { /* 該網資料不可用 → 略過,不入鏡 */ }
    });
  }, []);

  const scene = useMemo(() => {
    const sources: SourceV[] = [];
    const nodes: NodeV[] = [];
    let vcbCount = 0;
    INTRO_NETS.forEach((net) => {
      const d = data[net];
      const letter = SOURCE_LETTER_BY_NET[net];
      const srcPoly = letter ? BUILDING_POS[letter] : undefined;
      if (!d || !d.buildings.length || !srcPoly) return;
      const si = sources.length;
      const [sx, sy] = centroid(srcPoly);
      // 各棟負載率 + 所屬 VCB(真實電路分組,決定整條饋線一起帶電的點火順序)
      const ratioOf = new Map<string, number | null>();
      const vcbOfLetter = new Map<string, string>();
      const tr = new Map((d.pf?.transformer_loadings ?? []).map((t) => [t.transformer_id, t.load_ratio_percent]));
      const trVcb = new Map(d.trafos.map((t) => [t.name, t.vcb_id]));
      d.buildings.forEach((b) => {
        const L = buildingLetter(b.id);
        if (!ratioOf.has(L)) ratioOf.set(L, null);
        const r = tr.get(b.transformer_name);
        if (r != null) ratioOf.set(L, Math.max(ratioOf.get(L) ?? 0, r));
        if (!vcbOfLetter.has(L)) { const v = trVcb.get(b.transformer_name); if (v) vcbOfLetter.set(L, v); }
      });
      // 節點 = 該網建物(有座標、排除受電站本身字母,避免與核心重疊)
      const letters = [...new Set(d.buildings.map((b) => buildingLetter(b.id)))].filter((L) => L !== letter && BUILDING_POS[L]);
      const netNodes = letters.map((L, i) => {
        const [cx, cy] = centroid(BUILDING_POS[L]);
        return { L, cx, cy, dist: Math.hypot(cx - sx, cy - sy), vcb: vcbOfLetter.get(L) ?? L,
          color: flowColor(ratioOf.get(L) ?? null), poly: BUILDING_POS[L] as Pt[], hash: (i * 0.173) % 1, igniteDist: 0, srcIdx: si };
      });
      // 同一 VCB 用「該 VCB 平均距離」當點火距離 → 整條饋線一起帶電、各路 VCB 由近到遠串聯
      const grp = new Map<string, { sum: number; n: number }>();
      netNodes.forEach((n) => { const e = grp.get(n.vcb) ?? { sum: 0, n: 0 }; e.sum += n.dist; e.n++; grp.set(n.vcb, e); });
      netNodes.forEach((n) => { const e = grp.get(n.vcb)!; n.igniteDist = e.sum / e.n; });
      vcbCount += d.vcbCount;   // 真正 VCB 總數(含電容器專用 VCB,非僅有掛建物者)
      const maxDist = Math.max(...netNodes.map((n) => n.dist), 1);
      sources.push({ net, letter, sx, sy, surgeT: SURGE + si * STAGGER, maxDist, totalKw: d.pf ? d.pf.total_load_kw : 0 });
      netNodes.forEach((n) => nodes.push({ L: n.L, cx: n.cx, cy: n.cy, igniteDist: n.igniteDist, color: n.color, poly: n.poly, hash: n.hash, srcIdx: n.srcIdx }));
    });
    const energT = sources.length ? Math.max(...sources.map((s) => s.surgeT + s.maxDist / WAVE_SPEED)) : SURGE + 3;
    const totalKw = sources.reduce((a, s) => a + s.totalKw, 0);
    return { sources, nodes, energT, totalKw, vcbCount: vcbCount || 12 };
  }, [data]);

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
        embersRef.current = Array.from({ length: 56 }, () => ({
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
      const { sources, nodes, energT, totalKw, vcbCount } = sceneRef.current;
      const s0 = sources[0];

      ctx.save(); ctx.scale(dpr, dpr);
      const bg = ctx.createRadialGradient(W / 2, H * 0.46, 0, W / 2, H * 0.5, Math.max(W, H) * 0.8);
      bg.addColorStop(0, "#050a14"); bg.addColorStop(1, "#010206");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      const sX = W / MAP_W, sY = H / MAP_H;           // 填滿整個畫面
      const TX = (x: number) => x * sX, TY = (y: number) => y * sY;
      const SXc0 = s0 ? TX(s0.sx) : W / 2, SYc0 = s0 ? TY(s0.sy) : H / 2;   // 鏡頭錨點=首站(北 X)

      // 抖動折線(閃電)
      const bolt = (x1: number, y1: number, x2: number, y2: number, seg: number, jit: number) => {
        ctx.beginPath(); ctx.moveTo(x1, y1);
        for (let i = 1; i < seg; i++) { const t = i / seg; ctx.lineTo(x1 + (x2 - x1) * t + (Math.random() - 0.5) * jit, y1 + (y2 - y1) * t + (Math.random() - 0.5) * jit); }
        ctx.lineTo(x2, y2); ctx.stroke();
      };

      // === 鏡頭:醞釀特寫北 X → 點火後拉遠揭示全校園;點火/全亮瞬間鏡頭震動(衝擊感)===
      ctx.save();
      const shake = (t0: number, amp: number, dur: number) => { const k = Math.max(0, 1 - Math.abs(e - t0) / dur); return k > 0 ? (Math.random() - 0.5) * amp * k * k : 0; };
      ctx.translate(shake(SURGE, 14, 0.5) + shake(energT, 24, 0.55), shake(SURGE, 10, 0.5) + shake(energT, 18, 0.55));
      const cp = easeOut(Math.max(0, Math.min((e - SURGE) / CAM_DUR, 1)));
      const cz = CAM_START - (CAM_START - 1) * cp;
      ctx.translate(SXc0, SYc0); ctx.scale(cz, cz); ctx.translate(-SXc0, -SYc0);

      const img = imgRef.current;
      if (img && img.complete && img.naturalWidth) {
        ctx.globalAlpha = Math.min(0.14, Math.max(0, (e - 0.3) / 2.2));
        ctx.filter = "grayscale(1) brightness(1.8)";
        ctx.drawImage(img, 0, 0, W, H);
        ctx.filter = "none"; ctx.globalAlpha = 1;
      }

      // === 各棟:沿所屬受電站送電、依電流到達點火 ===
      let litCount = 0;
      for (const n of nodes) {
        const s = sources[n.srcIdx]; if (!s) continue;
        const SXc = TX(s.sx), SYc = TY(s.sy);
        const cx = TX(n.cx), cy = TY(n.cy);
        const waveR = Math.max(0, e - s.surgeT) * WAVE_SPEED;
        const charged = Math.max(0, Math.min(1, waveR / n.igniteDist));
        const igniteT = s.surgeT + n.igniteDist / WAVE_SPEED;
        const lit = e >= igniteT;
        if (lit) litCount++;
        const flash = lit ? Math.max(0, 1 - (e - igniteT) / 0.55) : 0;

        ctx.strokeStyle = "rgba(130,150,185,0.10)"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(SXc, SYc); ctx.lineTo(cx, cy); ctx.stroke();
        if (charged > 0) {
          const px = SXc + (cx - SXc) * charged, py = SYc + (cy - SYc) * charged;
          ctx.strokeStyle = n.color; ctx.lineWidth = 1.9; ctx.globalAlpha = 0.82 + Math.random() * 0.18;
          ctx.shadowBlur = 12; ctx.shadowColor = n.color;
          bolt(SXc, SYc, px, py, 7, 5 * charged + 1);
          ctx.shadowBlur = 0; ctx.globalAlpha = 1;
          if (charged < 1) {
            ctx.shadowBlur = 22; ctx.shadowColor = "#ffffff"; ctx.fillStyle = "#ffffff";
            ctx.beginPath(); ctx.arc(px, py, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
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
            for (let st = 0; st < 2; st++) {
              const ph = (e * 0.32 + st * 0.5 + n.hash) % 1;
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

      // === 各受電站:能量波(三環)+ 全亮後同步心跳 ===
      for (const s of sources) {
        const SXc = TX(s.sx), SYc = TY(s.sy);
        const waveR = Math.max(0, e - s.surgeT) * WAVE_SPEED;
        for (let w = 0; w < 3; w++) {
          const wr = waveR - w * 55;
          if (wr > 0 && wr < s.maxDist + 260) {
            const a = Math.max(0, (0.6 - w * 0.2) * (1 - wr / (s.maxDist + 260)));
            ctx.strokeStyle = `rgba(130,190,255,${a})`; ctx.lineWidth = 2.6 - w * 0.7;
            ctx.shadowBlur = 26; ctx.shadowColor = "rgba(130,190,255,0.85)";
            ctx.beginPath(); ctx.ellipse(SXc, SYc, wr * sX, wr * sY, 0, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
          }
        }
        if (e > energT + 0.5) {
          const hb = (e - energT - 0.5) % 2.6;
          if (hb < 1.5) {
            const hr = hb * 950, a = 0.42 * (1 - hb / 1.5);
            ctx.strokeStyle = `rgba(120,200,255,${a})`; ctx.lineWidth = 2.4; ctx.shadowBlur = 18; ctx.shadowColor = "rgba(120,200,255,0.6)";
            ctx.beginPath(); ctx.ellipse(SXc, SYc, hr * sX, hr * sY, 0, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
          }
        }
      }

      // 點火放射火花(各受電站於各自送電時刻爆發一次)
      const b = burstRef.current;
      for (let si = 0; si < sources.length; si++) {
        const s = sources[si];
        if (!b.done.has(si) && e >= s.surgeT) {
          b.done.add(si);
          for (let i = 0; i < 72; i++) { const ang = Math.random() * Math.PI * 2; const sp = 300 + Math.random() * 900;
            b.parts.push({ x: s.sx, y: s.sy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 1.1, max: 1.1 }); }
        }
      }
      for (const p of b.parts) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.95; p.vy *= 0.95; p.life -= dt;
        if (p.life <= 0) continue;
        const a = p.life / p.max;
        ctx.globalAlpha = a; ctx.shadowBlur = 8; ctx.shadowColor = "#bfe0ff"; ctx.fillStyle = "#dcebff";
        ctx.beginPath(); ctx.arc(TX(p.x), TY(p.y), 1.8 * a + 0.4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
      b.parts = b.parts.filter((p) => p.life > 0);

      // === 各受電站核心:醞釀預充環/電弧 → 送電脈衝 → 標籤 + 水平鏡頭光斑 ===
      for (const s of sources) {
        const SXc = TX(s.sx), SYc = TY(s.sy);
        const st = s.surgeT;
        const chg = Math.min(1, e / st);

        const flare = Math.max(0, 1 - Math.abs(e - st) / 0.5);
        if (flare > 0) {
          ctx.globalCompositeOperation = "lighter";
          const fg = ctx.createLinearGradient(SXc - W, SYc, SXc + W, SYc);
          fg.addColorStop(0, "rgba(120,180,255,0)"); fg.addColorStop(0.5, `rgba(180,215,255,${0.5 * flare})`); fg.addColorStop(1, "rgba(120,180,255,0)");
          ctx.fillStyle = fg; ctx.fillRect(SXc - W, SYc - 2.5 - flare * 3, W * 2, 5 + flare * 6);
          ctx.globalCompositeOperation = "source-over";
        }

        // 受電爬升:加速收束預充環 + 隨機電弧(越接近送電越急、越多)
        if (e < st) {
          for (let k = 0; k < 5; k++) {
            const ph = (e * (0.5 + chg * 2.2) + k * 0.2) % 1;
            const rr = 8 + (1 - ph) * (150 - chg * 80);
            const a = 0.5 * (1 - ph) * (0.2 + chg * 0.8);
            ctx.strokeStyle = `rgba(130,190,255,${a})`; ctx.lineWidth = 1.1 + chg * 1.4;
            ctx.beginPath(); ctx.arc(SXc, SYc, rr, 0, Math.PI * 2); ctx.stroke();
          }
          if (Math.random() < 0.25 + chg * 0.6) {
            const ang = Math.random() * Math.PI * 2, len = 16 + chg * 46;
            ctx.strokeStyle = `rgba(180,220,255,${0.4 + chg * 0.5})`; ctx.lineWidth = 1.2; ctx.shadowBlur = 10; ctx.shadowColor = "#9cc8ff";
            bolt(SXc, SYc, SXc + Math.cos(ang) * len, SYc + Math.sin(ang) * len, 4, 9); ctx.shadowBlur = 0;
          }
        }
        const surge = Math.max(0, 1 - Math.abs(e - st) / 0.45);
        const coreR = 5 + chg * 8 + surge * 20 + Math.sin(e * (4 + chg * 9)) * (1.2 + chg);
        ctx.shadowBlur = 22 + chg * 28 + surge * 50; ctx.shadowColor = "#9cc8ff"; ctx.fillStyle = "#5fa8ff";
        ctx.beginPath(); ctx.arc(SXc, SYc, coreR, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.arc(SXc, SYc, 2.5 + surge * 3, 0, Math.PI * 2); ctx.fill();
        if (e > st - 2.6) {
          ctx.globalAlpha = Math.min(1, (e - (st - 2.6)) / 0.5);
          ctx.fillStyle = "#9ccbff"; ctx.font = `14px ${MONO}`; ctx.textAlign = "center";
          ctx.fillText(`${s.letter} · ${NET_NAME[s.net] ?? ""}受電站 · 台電 11.4kV`, SXc, SYc - 24);
          ctx.globalAlpha = 1;
        }
      }

      ctx.restore();   // 結束鏡頭

      // === 螢幕層 ===
      // 高潮:各站送電白閃 + 全亮爆閃 + 多重衝擊波
      let surgeFl = 0;
      for (const s of sources) surgeFl = Math.max(surgeFl, Math.max(0, 1 - Math.abs(e - s.surgeT) / 0.32) * 0.5);
      const fullFl = e >= energT ? Math.max(0, 1 - (e - energT) / 0.6) : 0;
      const fl = Math.max(surgeFl, fullFl * 0.88);
      if (fl > 0) { ctx.fillStyle = `rgba(255,255,255,${fl})`; ctx.fillRect(0, 0, W, H); }
      const shock = (t0: number, count: number, spd: number) => {
        for (let i = 0; i < count; i++) { const sw2 = e - t0 - i * 0.13;
          if (sw2 > 0 && sw2 < 0.9) { const a = 1 - sw2 / 0.9; ctx.strokeStyle = `rgba(200,230,255,${a * 0.8})`; ctx.lineWidth = 3 * a + 1;
            ctx.beginPath(); ctx.arc(W / 2, H / 2, sw2 * spd, 0, Math.PI * 2); ctx.stroke(); } }
      };
      for (const s of sources) shock(s.surgeT, 2, 1500);
      shock(energT, 3, 2000);

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

      // === 任務控制 HUD(遙測 / 倒數)===
      {
        const pct = nodes.length ? litCount / nodes.length : 0;
        const chgH = Math.min(1, e / SURGE);
        const armWin = Math.max(0.1, SURGE - 0.6);
        const vcbOnline = e < SURGE ? Math.max(0, Math.min(vcbCount, Math.floor(((e - 0.6) / armWin) * vcbCount))) : Math.round(vcbCount * pct);
        const freq = e < 0.6 ? 0 : Math.min(60, 59.2 + chgH * 0.8);
        const volt = e < SURGE ? chgH : Math.min(1, 0.97 + pct * 0.03);
        const loadNow = e < SURGE ? 0 : Math.round(totalKw * pct);
        ctx.globalAlpha = Math.min(1, e / 0.6);

        ctx.textAlign = "center";
        if (e < SURGE) {
          ctx.fillStyle = "#9ccbff"; ctx.font = `13px ${MONO}`;
          ctx.fillText("台電進線受電中 · INCOMING SUPPLY", W / 2, 40);
          const beat = 1 - ((SURGE - e) % 1);           // 每秒一脈
          ctx.fillStyle = "#7db8ff"; ctx.font = `bold ${46 + beat * 6}px ${MONO}`;
          ctx.shadowBlur = 14 + beat * 14; ctx.shadowColor = "#5fa8ff"; ctx.globalAlpha = Math.min(1, e / 0.6);
          ctx.fillText(`${(chgH * 11.4).toFixed(1)} kV`, W / 2, 98); ctx.shadowBlur = 0;
        }

        // 全線帶電狀態 + 遙測讀數:以「讀條」為基準,上方狀態列、下方讀數一律對齊讀條水平中心(置中)。
        // 整塊垂直對齊底部置中「進入系統」按鈕同一水平(按鈕 bottom:6%+高約40px → 中心約 0.94H-20)。
        const bw = 300;                           // 讀條寬
        const lx = Math.round(W * 0.07);          // 讀條左起點(自邊界右移)
        const barCX = lx + bw / 2;                // 讀條水平中心(上下數值置中基準)
        const btnCenterY = H * 0.94 - 20;         // 進入系統按鈕垂直中心
        const blockY = Math.round(btnCenterY - 85); // 左側 HUD 起點(整塊略上移,讓出按鈕空間)
        if (e >= SURGE) {
          const label = e < SURGE + 0.5 ? "◆ 併網送電 · GRID ONLINE" : pct >= 1 ? "● ALL SYSTEMS NOMINAL · 全線帶電" : "SYSTEM ENERGIZING · 送電中";
          const ly = blockY, bx = lx, by = ly + 14;
          ctx.fillStyle = pct >= 1 ? "#3ad07a" : e < SURGE + 0.5 ? "#ffd27a" : "#7db8ff"; ctx.font = `bold 15px ${MONO}`; ctx.textAlign = "center";
          ctx.fillText(label, barCX, ly);
          ctx.strokeStyle = "rgba(120,160,220,0.5)"; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, 6);
          ctx.fillStyle = pct >= 1 ? "#3ad07a" : "#5fa8ff"; ctx.shadowBlur = 10; ctx.shadowColor = ctx.fillStyle;
          ctx.fillRect(bx, by, bw * pct, 6); ctx.shadowBlur = 0;
          ctx.fillStyle = "#cfe2ff"; ctx.font = `13px ${MONO}`; ctx.textAlign = "left";
          ctx.fillText(`${Math.round(pct * 100)}%`, bx + bw + 12, by + 6);
        }

        // 讀數:置於讀條下方,整組(label↔value)以讀條中心對稱排列(寬 200,中心=barCX)。
        const ty = blockY + 46;
        ctx.font = `12px ${MONO}`;
        ([["總負載 LOAD", `${loadNow.toLocaleString()} kW`], ["頻率 FREQ", `${freq.toFixed(1)} Hz`],
          ["VCB 上線", `${vcbOnline} / ${vcbCount}`], ["電壓 BUS", `${volt.toFixed(2)} pu`]] as [string, string][])
          .forEach((r, i) => {
            const yy = ty + i * 22;
            ctx.textAlign = "left"; ctx.fillStyle = "#5f86a8"; ctx.fillText(r[0], barCX - 100, yy);
            ctx.textAlign = "right"; ctx.fillStyle = "#cfe2ff"; ctx.fillText(r[1], barCX + 100, yy);
          });
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
        @keyframes wrIntroBrand { from { opacity: 0; transform: translateX(-12px) } to { opacity: 1; transform: none } }
        @keyframes wrIntroBtn { to { opacity: 1; transform: none } }
        @keyframes wrStudioCard { 0%, 62% { opacity: 1 } 100% { opacity: 0 } }
        @keyframes wrStudioIn { 0% { opacity: 0; transform: scale(.9) } 55% { opacity: 1 } 100% { opacity: 1; transform: none } }
      `}</style>
      <a onClick={onEnter} style={{ position: "absolute", top: 22, right: 26, color: "#7c848e", fontFamily: MONO, fontSize: 12, letterSpacing: 2, cursor: "pointer" }}>略過 SKIP ▸</a>

      {/* 校徽 + 校名:全線帶電後從左上角淡入(不擋中間棟別) */}
      <div style={{ position: "absolute", top: 20, left: 26, display: "flex", alignItems: "center", gap: 12, opacity: 0, animation: "wrIntroBrand 1s cubic-bezier(.2,.8,.2,1) 5.6s forwards", pointerEvents: "none" }}>
        <img src="/stust-logo.png" alt="南臺科技大學" style={{ height: 42, filter: "drop-shadow(0 0 12px rgba(120,180,255,.6))" }} />
        <span style={{ color: "#eaf2ff", fontSize: 19, fontWeight: 700, letterSpacing: 2, textShadow: "0 0 22px #1677ffaa" }}>南臺科技大學</span>
      </div>
      {/* 進入系統:獨立固定於底部、留足邊距,不被標題擠到貼邊 */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: "6%", display: "flex", justifyContent: "center", pointerEvents: "none" }}>
        <button onClick={onEnter} style={{
          opacity: 0, transform: "translateY(8px)", animation: "wrIntroBtn 0.7s ease 7.0s forwards", pointerEvents: "auto",
          background: "rgba(95,168,255,0.10)", border: "1px solid rgba(120,180,255,0.5)", color: "#cfe2ff", fontFamily: MONO,
          fontSize: 15, letterSpacing: 3, padding: "11px 30px", cursor: "pointer", borderRadius: 2,
        }}>進入系統 ▸</button>
      </div>

      {/* 開場片廠 logo 卡:純黑中央校徽 → 淡出後進入通電序列(置最上層,淡出後不擋操作) */}
      <div style={{ position: "absolute", inset: 0, background: "#01030a", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", animation: "wrStudioCard 2s ease forwards" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, animation: "wrStudioIn 0.9s cubic-bezier(.2,.8,.2,1) forwards" }}>
          <img src="/stust-logo.png" alt="南臺科技大學" style={{ height: 104, filter: "drop-shadow(0 0 28px rgba(120,180,255,.65))" }} />
          <div style={{ fontSize: 33, fontWeight: 800, letterSpacing: 9, color: "#eaf2ff", textShadow: "0 0 36px #1677ffcc" }}>南臺科技大學</div>
          <div style={{ fontSize: 11.5, letterSpacing: 5, color: "#7da8d8", fontFamily: MONO }}>SOUTHERN TAIWAN UNIVERSITY OF SCIENCE AND TECHNOLOGY</div>
        </div>
      </div>
    </div>
  );
}
