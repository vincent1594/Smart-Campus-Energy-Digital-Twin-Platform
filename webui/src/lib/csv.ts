// 前端 CSV 匯出工具。加 UTF-8 BOM,Excel 開啟中文不亂碼。
export interface CsvCol<T> {
  label: string;
  value: (row: T) => string | number | null | undefined;
}

function esc(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV<T>(rows: T[], cols: CsvCol<T>[]): string {
  const header = cols.map((c) => esc(c.label)).join(",");
  const body = rows.map((r) => cols.map((c) => esc(c.value(r))).join(",")).join("\n");
  return "﻿" + header + "\n" + body;
}

export function downloadCSV<T>(filename: string, rows: T[], cols: CsvCol<T>[]): void {
  const blob = new Blob([toCSV(rows, cols)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// 檔名用的日期戳,如 20260618_1530
export function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
