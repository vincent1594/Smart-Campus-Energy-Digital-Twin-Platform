// 校園地圖背景 + 各棟「多邊形」範圍(不規則,可在校園地圖編輯模式拖頂點/加點/刪點後匯出)。
import { asset } from "./asset";

export const MAP_IMAGE = asset("campus_map_1036x733.png");
// 座標空間維持 1498×1050:各棟多邊形以此為基準校準,新底圖為同一取景的另一解析度,
// SVG 疊圖以 preserveAspectRatio="none" 等比例對應 → 換圖不影響標記對齊。
export const MAP_W = 1498;
export const MAP_H = 1050;

export const SOURCE_KEY = "__SOURCE__";
export const SOURCE_LETTER = "X";

// 各電網的受電站位置 (字母)。北電錶受電站在 X 棟;南電錶受電站在 H1 棟。
// 兩者為各自獨立的 11.4kV 受電來源。南網的 H1 同時也是一棟負載建物。
export const SOURCE_LETTER_BY_NET: Record<string, string> = { north: "X", south: "H1" };

// 南電錶建物字母集合;其餘字母歸北電錶。用於「全校園」總覽:由建物字母判斷它屬於哪個系統。
export const SOUTH_LETTERS = new Set(["H1", "H2", "H6", "E", "U", "O"]);
export function netOfLetter(letter: string): string {
  return SOUTH_LETTERS.has(letter) ? "south" : "north";
}
// 全校園總覽:兩系統的識別色(地圖建物外框/圖例)。填色仍代表負載率,外框代表所屬系統。
export const NET_COLOR: Record<string, string> = { north: "#2f54eb", south: "#08979c" };
export const NET_NAME: Record<string, string> = { north: "北電錶", south: "南電錶" };

// 尚在開發中的電網:UI 就近標「開發中」(模型尚未完成校正)。校正完成移除即可。
export const DEV_NETS = new Set(["south"]);

export type Pt = [number, number];

// 各棟多邊形頂點(絕對座標,以 MAP_W×MAP_H 為基準)。初值為矩形 4 點,可編輯成不規則。
export const BUILDING_POS: Record<string, Pt[]> = {
  X: [[186, 209], [210, 210], [210, 269], [186, 268]],
  I: [[247, 131], [355, 131], [356, 200], [247, 201]],
  J: [[246, 224], [354, 224], [353, 261], [246, 260]],
  A: [[393, 169], [512, 169], [512, 198], [393, 198]],
  B: [[387, 229], [514, 229], [514, 256], [387, 256]],
  K: [[548, 165], [669, 165], [669, 258], [548, 258]],
  L: [[543, 284], [670, 283], [672, 368], [543, 367]],
  C: [[391, 291], [454, 291], [513, 291], [513, 315], [391, 315]],
  D: [[393, 341], [515, 341], [514, 363], [393, 363]],
  S: [[254, 283], [355, 284], [357, 432], [255, 390]],
  Z: [[481, 396], [510, 396], [509, 423], [481, 422]],
  P: [[163, 282], [192, 283], [192, 385], [164, 385]],
  Q: [[671, 89], [789, 90], [789, 110], [671, 109]],
  R: [[777, 130], [814, 131], [814, 163], [777, 163]],
  V: [[842, 167], [859, 125], [936, 126], [882, 144]],
  N: [[862, 288], [960, 267], [985, 336], [885, 355]],
  Y: [[884, 371], [1006, 348], [1021, 403], [897, 422]],
  T: [[1015, 257], [1142, 231], [1177, 313], [1050, 342]],
  W: [[1172, 228], [1245, 211], [1335, 272], [1209, 315]],
  M: [[548, 528], [680, 528], [680, 598], [548, 597]],
  G: [[744, 616], [920, 590], [937, 653], [758, 679]],
  F: [[918, 473], [951, 464], [993, 571], [958, 578]],
  H3: [[257, 548], [370, 588], [350, 629], [234, 587]],

  // 南電錶 6 棟 (受電站=H1;E棟-5 原污水廠併入 E,不另設標記)
  H2: [[968, 592], [1002, 581], [1030, 646], [995, 660]],
  H1: [[1040, 696], [1088, 690], [1115, 802], [1067, 808]],
  H6: [[632, 729], [678, 729], [679, 879], [632, 879]],
  E: [[547, 455], [669, 453], [670, 516], [548, 517]],
  U: [[605, 609], [675, 609], [676, 647], [605, 647]],
  O: [[758, 852], [815, 852], [820, 892], [752, 890]],
};

export function centroid(pts: Pt[]): Pt {
  const n = pts.length || 1;
  const sx = pts.reduce((s, p) => s + p[0], 0) / n;
  const sy = pts.reduce((s, p) => s + p[1], 0) / n;
  return [sx, sy];
}

// 南電錶:負載 → 建物代號。南網建物只有 H1 / H2 / H6 / E / U / O 六棟,受電站在 H1 棟。
// LOAD_H2 必須覆寫:H2 是多字元建物名,不可比照北網把尾碼數字當序號剝掉 (通則會誤得 "H")。
// 其餘 H1_*/H6_*/E_*/U_*/O 用下方通則即可 (含 LOAD_E_5「原污水廠,掛 TR_E_5 歸入 E」→ "E_5".split("_")[0] = "E")。
// 此 key 只存在於南網 (北網無 LOAD_H2),故無條件套用,所有呼叫端 (地圖/焦點面板/情境) 一致。
const SOUTH_LOAD_TO_BUILDING: Record<string, string> = {
  LOAD_H2: "H2",
};

export function buildingLetter(loadCode: string, _net?: string): string {
  if (SOUTH_LOAD_TO_BUILDING[loadCode]) return SOUTH_LOAD_TO_BUILDING[loadCode];
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
