// 校園地圖背景 + 各棟在圖上的像素座標。
// 座標為目測初值,可在「校園地圖」頁開啟「編輯位置」拖曳各棟,再「匯出座標」貼回這裡。

// 已裁切只留校園圖(原圖 2364×1771,裁掉右側棟別介紹;裁切原點 0,0,故座標不變)
export const MAP_IMAGE = "/stustmap_campus.png";
export const MAP_W = 1420;
export const MAP_H = 1771;

// 受電站 = X棟(創思設計坊):北側所有 VCB 在此匯集、台電由此進線。
// X 的座標放在 BUILDING_POS["X"],可比照各棟在編輯模式拖曳微調。
export const SOURCE_KEY = "__SOURCE__";
export const SOURCE_LETTER = "X";

// 建築字母 -> 地圖像素座標 (以 2364x1771 為基準)
export const BUILDING_POS: Record<string, { x: number; y: number }> = {
  X: { x: 202, y: 511 }, // 受電站(X棟)= 所有 VCB 匯集點,已校正
  I: { x: 305, y: 415 },
  J: { x: 306, y: 507 },
  A: { x: 461, y: 434 },
  B: { x: 459, y: 514 },
  K: { x: 615, y: 474 },
  L: { x: 618, y: 629 },
  C: { x: 456, y: 599 },
  D: { x: 457, y: 671 },
  S: { x: 314, y: 639 },
  Z: { x: 505, y: 708 },
  P: { x: 179, y: 637 },
  Q: { x: 736, y: 317 },
  R: { x: 805, y: 387 },
  V: { x: 888, y: 362 },
  N: { x: 931, y: 611 },
  Y: { x: 961, y: 716 },
  T: { x: 1104, y: 577 },
  W: { x: 1256, y: 538 },
  M: { x: 619, y: 954 },
  G: { x: 858, y: 1075 },
  F: { x: 965, y: 894 },
  H3: { x: 303, y: 986 },
};

// 由負載代碼推出建築字母:LOAD_K1->K、LOAD_H3_1->H3、LOAD_R1->R、LOAD_F2->F …
export function buildingLetter(loadCode: string): string {
  const s = loadCode.replace(/^LOAD_/, "");
  if (s.includes("_")) return s.split("_")[0]; // H3_1 -> H3
  return s.replace(/\d+$/, ""); // K1 -> K, R1 -> R, N -> N
}

export function ratioColor(ratio: number | null): { bg: string; border: string } {
  if (ratio == null) return { bg: "#bfbfbf", border: "#8c8c8c" };
  if (ratio > 100) return { bg: "#ff4d4f", border: "#a8071a" };
  if (ratio >= 80) return { bg: "#fa8c16", border: "#ad4e00" };
  if (ratio >= 50) return { bg: "#fadb14", border: "#ad8b00" };
  return { bg: "#52c41a", border: "#237804" };
}
