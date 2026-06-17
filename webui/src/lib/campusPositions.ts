// 校園地圖背景 + 各棟「多邊形」範圍(不規則,可在校園地圖編輯模式拖頂點/加點/刪點後匯出)。

export const MAP_IMAGE = "/campus-map.png";
export const MAP_W = 1498;
export const MAP_H = 1050;

export const SOURCE_KEY = "__SOURCE__";
export const SOURCE_LETTER = "X";

export type Pt = [number, number];

// 各棟多邊形頂點(絕對座標,以 MAP_W×MAP_H 為基準)。初值為矩形 4 點,可編輯成不規則。
export const BUILDING_POS: Record<string, Pt[]> = {
  X: [[210, 225], [231, 226], [231, 300], [210, 299]],
  I: [[277, 132], [387, 131], [389, 214], [276, 214]],
  J: [[281, 245], [386, 245], [388, 282], [281, 281]],
  A: [[431, 179], [553, 178], [554, 212], [431, 213]],
  B: [[428, 254], [555, 254], [554, 280], [427, 280]],
  K: [[593, 177], [714, 177], [715, 285], [593, 285]],
  L: [[588, 323], [715, 322], [715, 421], [589, 422]],
  C: [[429, 332], [492, 333], [551, 332], [551, 357], [429, 356]],
  D: [[429, 391], [551, 391], [551, 413], [429, 413]],
  S: [[288, 321], [389, 322], [391, 497], [288, 451]],
  Z: [[522, 461], [551, 461], [550, 488], [522, 487]],
  P: [[189, 326], [218, 327], [216, 447], [190, 445]],
  Q: [[717, 84], [836, 83], [836, 106], [718, 106]],
  R: [[825, 138], [862, 139], [862, 171], [825, 173]],
  V: [[897, 144], [911, 129], [988, 130], [893, 173]],
  N: [[911, 326], [1005, 304], [1028, 381], [936, 406]],
  Y: [[936, 425], [1051, 403], [1067, 467], [949, 485]],
  T: [[1070, 295], [1196, 265], [1225, 361], [1101, 392]],
  W: [[1230, 257], [1303, 241], [1386, 318], [1262, 352]],
  M: [[600, 611], [714, 611], [715, 690], [601, 690]],
  G: [[795, 715], [964, 684], [978, 753], [810, 784]],
  F: [[964, 545], [999, 536], [1037, 656], [1001, 666]],
  H3: [[274, 561], [382, 612], [364, 655], [252, 606]],
};

export function centroid(pts: Pt[]): Pt {
  const n = pts.length || 1;
  const sx = pts.reduce((s, p) => s + p[0], 0) / n;
  const sy = pts.reduce((s, p) => s + p[1], 0) / n;
  return [sx, sy];
}

export function buildingLetter(loadCode: string): string {
  const s = loadCode.replace(/^LOAD_/, "");
  if (s.includes("_")) return s.split("_")[0];
  return s.replace(/\d+$/, "");
}

export function ratioColor(ratio: number | null): { bg: string; border: string } {
  if (ratio == null) return { bg: "#bfbfbf", border: "#8c8c8c" };
  if (ratio > 100) return { bg: "#ff4d4f", border: "#a8071a" };
  if (ratio >= 80) return { bg: "#fa8c16", border: "#ad4e00" };
  if (ratio >= 50) return { bg: "#fadb14", border: "#ad8b00" };
  return { bg: "#52c41a", border: "#237804" };
}
