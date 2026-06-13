// 校園地圖背景 + 各棟「多邊形」範圍(不規則,可在校園地圖編輯模式拖頂點/加點/刪點後匯出)。

export const MAP_IMAGE = "/campus-map.png";
export const MAP_W = 556;
export const MAP_H = 518;

export const SOURCE_KEY = "__SOURCE__";
export const SOURCE_LETTER = "X";

export type Pt = [number, number];

// 各棟多邊形頂點(絕對座標,以 MAP_W×MAP_H 為基準)。初值為矩形 4 點,可編輯成不規則。
export const BUILDING_POS: Record<string, Pt[]> = {
  X: [[75, 103], [86, 103], [87, 132], [76, 132]],
  I: [[103, 67], [136, 67], [137, 99], [103, 99]],
  J: [[101, 110], [137, 110], [138, 125], [102, 125]],
  A: [[154, 83], [196, 83], [197, 97], [154, 97]],
  B: [[154, 113], [196, 114], [196, 125], [154, 124]],
  K: [[214, 86], [252, 86], [252, 125], [214, 124]],
  L: [[213, 145], [251, 145], [253, 180], [214, 178]],
  C: [[153, 146], [173, 146], [197, 146], [196, 156], [155, 155]],
  D: [[153, 169], [196, 169], [196, 178], [154, 177]],
  S: [[105, 141], [138, 141], [138, 194], [106, 193]],
  Z: [[184, 197], [195, 196], [195, 208], [184, 207]],
  P: [[69, 142], [78, 142], [78, 187], [70, 187]],
  Q: [[256, 43], [298, 43], [299, 52], [255, 53]],
  R: [[296, 66], [307, 68], [308, 82], [296, 81]],
  V: [[322, 71], [328, 61], [346, 63], [326, 79]],
  N: [[330, 143], [360, 137], [368, 165], [338, 171]],
  Y: [[339, 185], [375, 178], [381, 199], [344, 206]],
  T: [[390, 133], [428, 122], [437, 151], [398, 161]],
  W: [[446, 114], [464, 105], [496, 132], [457, 151]],
  M: [[213, 264], [256, 265], [257, 297], [212, 296]],
  G: [[288, 323], [350, 310], [354, 323], [290, 335]],
  F: [[347, 236], [359, 231], [374, 281], [363, 284]],
  H3: [[104, 275], [144, 294], [136, 309], [96, 290]],
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
