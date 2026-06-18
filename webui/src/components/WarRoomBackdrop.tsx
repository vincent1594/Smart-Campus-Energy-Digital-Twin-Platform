// 戰情室電影級背景(Canvas,鋪滿整個戰情室,面板浮在其上):
// 深空漸層 + 雙層視差星空(閃爍漂移)+ 緩慢飄移星雲輝光 + 地球軌道弧光(大氣輝光) + 偶發流星。
// 純程序生成、requestAnimationFrame;呼應 spacex.com 那種電影感動態背景。
import { useEffect, useRef } from "react";

interface Star { x: number; y: number; r: number; a: number; tw: number; ph: number; vx: number }
interface Neb { x: number; y: number; r: number; c: string; dx: number; dy: number }

export default function WarRoomBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const nebRef = useRef<Neb[]>([]);
  const meteorRef = useRef<{ x: number; y: number; vx: number; vy: number; life: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    let raf = 0, W = 0, H = 0, dpr = 1, last = 0, nextMeteor = 3;

    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const seed = () => {
      starsRef.current = Array.from({ length: 280 }, () => {
        const near = Math.random() < 0.32;
        return { x: Math.random(), y: Math.random(), r: near ? rand(0.9, 1.8) : rand(0.3, 0.9),
          a: rand(0.25, 0.9), tw: rand(0.4, 1.8), ph: rand(0, 6.28), vx: (near ? 0.006 : 0.002) };
      });
      nebRef.current = [
        { x: 0.22, y: 0.30, r: 0.42, c: "60,110,220", dx: 0.004, dy: 0.002 },
        { x: 0.74, y: 0.22, r: 0.36, c: "120,70,200", dx: -0.003, dy: 0.0025 },
        { x: 0.55, y: 0.62, r: 0.5, c: "30,120,160", dx: 0.0025, dy: -0.002 },
      ];
    };
    seed();

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(canvas);

    const draw = (ts: number) => {
      raf = requestAnimationFrame(draw);
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016; last = ts;
      const t = ts / 1000;
      ctx.save(); ctx.scale(dpr, dpr);

      // 深空底漸層
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#02030a"); bg.addColorStop(0.55, "#050912"); bg.addColorStop(1, "#070d1c");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      // 星雲輝光(疊加)
      ctx.globalCompositeOperation = "lighter";
      for (const n of nebRef.current) {
        const cx = (n.x + Math.sin(t * n.dx * 6) * 0.03) * W;
        const cy = (n.y + Math.cos(t * n.dy * 6) * 0.03) * H;
        const R = n.r * Math.max(W, H);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
        g.addColorStop(0, `rgba(${n.c},0.10)`); g.addColorStop(0.5, `rgba(${n.c},0.04)`); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      ctx.globalCompositeOperation = "source-over";

      // 星空(視差漂移 + 閃爍)
      for (const s of starsRef.current) {
        s.x += s.vx * dt * 0.02; if (s.x > 1) s.x -= 1;
        const a = s.a * (0.6 + 0.4 * Math.sin(t * s.tw + s.ph));
        ctx.globalAlpha = Math.max(0, a);
        ctx.fillStyle = "#cfe2ff";
        ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 地球軌道弧光(底部大氣輝光)
      const R = W * 1.4;
      const cx = W / 2, cy = H + R - H * 0.13;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = "#010309"; ctx.fill();                    // 地球暗面
      ctx.save();
      ctx.shadowBlur = 40; ctx.shadowColor = "rgba(80,150,255,0.7)";
      ctx.lineWidth = 2.2; ctx.strokeStyle = "rgba(120,180,255,0.55)";
      ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.shadowBlur = 70; ctx.lineWidth = 1; ctx.strokeStyle = "rgba(90,160,255,0.3)";
      ctx.beginPath(); ctx.arc(cx, cy, R + 6, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.restore();

      // 偶發流星
      nextMeteor -= dt;
      if (!meteorRef.current && nextMeteor <= 0) {
        meteorRef.current = { x: rand(0.1, 0.7) * W, y: rand(0.0, 0.3) * H, vx: rand(180, 320), vy: rand(90, 160), life: 1 };
        nextMeteor = rand(5, 12);
      }
      const m = meteorRef.current;
      if (m) {
        m.x += m.vx * dt; m.y += m.vy * dt; m.life -= dt * 0.7;
        const sp = Math.hypot(m.vx, m.vy) || 1; const len = 110;
        const tx = m.x - (m.vx / sp) * len, ty = m.y - (m.vy / sp) * len;
        const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
        g.addColorStop(0, `rgba(205,228,255,${Math.max(0, m.life)})`); g.addColorStop(1, "rgba(205,228,255,0)");
        ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(tx, ty); ctx.stroke();
        if (m.life <= 0 || m.x > W + len || m.y > H + len) meteorRef.current = null;
      }

      ctx.restore();
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />;
}
