// public/ 靜態資源的「絕對路徑」要帶上 Vite base(子路徑部署為 /MEN/),
// 否則瀏覽器會打到網域根 → 503 白圖。寫死的字串 "/x.png" 不會被 Vite 自動改寫,
// 所有 public 資源(img src / fetch 靜態檔 / 回首頁導向)一律經此 helper。
//   dev:  BASE_URL="/"     → "/x.png"
//   prod: BASE_URL="/MEN/" → "/MEN/x.png"
export const asset = (path: string): string =>
  import.meta.env.BASE_URL + path.replace(/^\/+/, "");
