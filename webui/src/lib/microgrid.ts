// 地圖「再生能源」徽章資料:由微電網 API 推出各棟的徽章。
//  - 有實體設備的棟 (der.building,例如 D、Z):列出設備類型 (pv/ess/gen) 與容量摘要
//  - 與設備共用同一台變壓器、但本身沒有設備的棟 (例如 C,與 D 共用 TR_CD):標為「微電網供電」(served)
// 目前只有北電錶有微電網。資料只抓一次,模組層快取,所有地圖共用。
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { DerAsset, DerKind } from "../api/types";
import { buildingLetter } from "./campusPositions";

export const MICROGRID_NET = "north";

export interface MicrogridBadge {
  letter: string;
  kinds: DerKind[];       // 依 pv → ess → gen 排序;served 棟為空
  served: boolean;        // true = 無實體設備,僅由微電網所在變壓器供電
  site: string;           // 站別,例如「C/D 棟」
  derIds: string[];       // 該棟的設備代號 (served 棟為空)
  summary: string;        // 名牌用摘要,例如「☀ 98.01kWp · 🔋 200kW/430kWh」
}

const ORDER: DerKind[] = ["pv", "ess", "gen"];

function buildBadges(ders: DerAsset[], loadToTrafo: { id: string; transformer_name: string }[]): MicrogridBadge[] {
  const byLetter = new Map<string, DerAsset[]>();
  ders.forEach((d) => byLetter.set(d.building, [...(byLetter.get(d.building) ?? []), d]));
  const out: MicrogridBadge[] = [];
  for (const [letter, ds] of byLetter) {
    const pv = ds.filter((d) => d.kind === "pv").reduce((s, d) => s + (d.kwp ?? 0), 0);
    const essKw = ds.filter((d) => d.kind === "ess").reduce((s, d) => s + d.rating_kw, 0);
    const essKwh = ds.filter((d) => d.kind === "ess").reduce((s, d) => s + (d.energy_kwh ?? 0), 0);
    const gen = ds.filter((d) => d.kind === "gen").reduce((s, d) => s + d.rating_kw, 0);
    const parts = [
      pv ? `☀ ${+pv.toFixed(2)}kWp` : "",
      essKw ? `🔋 ${essKw}kW/${essKwh}kWh` : "",
      gen ? `⚡ 發電機 ${gen}kW` : "",
    ].filter(Boolean);
    out.push({
      letter, served: false, site: ds[0].site, derIds: ds.map((d) => d.der_id),
      kinds: ORDER.filter((k) => ds.some((d) => d.kind === k)), summary: parts.join(" · "),
    });
  }
  // 共用同一台變壓器的其他棟 → 微電網供電
  const trafoInfo = new Map(ders.map((d) => [d.transformer_id, { site: d.site, letter: d.building }]));
  const done = new Set(out.map((b) => b.letter));
  for (const b of loadToTrafo) {
    const info = trafoInfo.get(b.transformer_name);
    const L = buildingLetter(b.id);
    if (!info || done.has(L)) continue;
    done.add(L);
    out.push({ letter: L, served: true, kinds: [], site: info.site, derIds: [],
      summary: `⚡ 微電網供電(與 ${info.letter} 棟共用 ${b.transformer_name})` });
  }
  return out;
}

let cache: Promise<MicrogridBadge[]> | null = null;

function loadBadges(): Promise<MicrogridBadge[]> {
  if (!cache) {
    cache = Promise.all([api.derOf(MICROGRID_NET), api.buildingsOf(MICROGRID_NET)])
      .then(([ders, blds]) => buildBadges(ders, blds))
      .catch(() => { cache = null; return []; });   // 失敗不快取,下次再試
  }
  return cache;
}

/** 各棟再生能源徽章 (letter → badge)。 */
export function useMicrogridBadges(): Map<string, MicrogridBadge> {
  const [m, setM] = useState<Map<string, MicrogridBadge>>(new Map());
  useEffect(() => {
    let alive = true;
    loadBadges().then((bs) => { if (alive) setM(new Map(bs.map((b) => [b.letter, b]))); });
    return () => { alive = false; };
  }, []);
  return m;
}
