// 可拖曳調整欄寬的 antd Table(像 Excel):滑到標題列欄位右緣出現分隔把手,左右拖曳改寬;
// 雙擊把手 → 全部欄寬回復自動。用法與 antd Table 完全相同,直接取代 import 即可。
import { Table as AntTable, type TableProps } from "antd";
import { useCallback, useMemo, useState, type ThHTMLAttributes } from "react";

const MIN_W = 48;

type Col = NonNullable<TableProps<any>["columns"]>[number];

function colKey(c: Col, i: number): string {
  if (c.key != null) return String(c.key);
  const di = (c as { dataIndex?: unknown }).dataIndex;
  if (Array.isArray(di)) return di.join(".");
  if (di != null) return String(di);
  return `__${i}`;
}

type CellProps = ThHTMLAttributes<HTMLTableCellElement> & {
  "data-colkey"?: string;
  onResizeStart?: (key: string, e: React.PointerEvent) => void;
  onResizeReset?: () => void;
};

function ResizableHeaderCell({ onResizeStart, onResizeReset, children, ...rest }: CellProps) {
  const key = rest["data-colkey"];
  if (!key || !onResizeStart) return <th {...rest}>{children}</th>;
  return (
    <th {...rest}>
      {children}
      <span className="rt-handle" title="拖曳調整欄寬;雙擊回復自動"
        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onResizeStart(key, e); }}
        onClick={(e) => e.stopPropagation()}   // 不觸發排序
        onDoubleClick={(e) => { e.stopPropagation(); onResizeReset?.(); }} />
    </th>
  );
}

export default function ResizableTable<T extends object>(props: TableProps<T>) {
  const { columns, components, scroll, tableLayout, ...rest } = props;
  const [widths, setWidths] = useState<Record<string, number> | null>(null);

  const onResizeStart = useCallback((key: string, e: React.PointerEvent) => {
    const row = (e.currentTarget as HTMLElement).closest("tr"); if (!row) return;
    // 第一次拖曳:把目前所有欄的實際寬度定格下來,之後只改被拖的那欄,其他欄不跳動
    const snap: Record<string, number> = {};
    row.querySelectorAll<HTMLTableCellElement>("th[data-colkey]").forEach((th) => {
      snap[th.dataset.colkey!] = th.getBoundingClientRect().width;
    });
    const base = { ...snap, ...(widths ?? {}) };
    const start = base[key] ?? MIN_W;
    const x0 = e.clientX;
    setWidths(base);
    document.body.classList.add("rt-resizing");
    const move = (ev: PointerEvent) => {
      const w = Math.max(MIN_W, Math.round(start + ev.clientX - x0));
      setWidths((cur) => ({ ...(cur ?? base), [key]: w }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove("rt-resizing");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [widths]);

  const onResizeReset = useCallback(() => setWidths(null), []);

  const cols = useMemo(() => columns?.map((c, i) => {
    if ("children" in c && c.children) return c;   // 群組標題不提供拖曳
    const k = colKey(c, i);
    const orig = c.onHeaderCell;
    return {
      ...c,
      width: widths?.[k] ?? c.width,
      onHeaderCell: (col: Col) => ({
        ...(orig ? orig(col as never) : {}),
        "data-colkey": k, onResizeStart, onResizeReset,
      }) as React.HTMLAttributes<HTMLElement>,
    };
  }) as TableProps<T>["columns"], [columns, widths, onResizeStart, onResizeReset]);

  // 拖過之後:固定版面 + 表格總寬 = 各欄寬總和(超出容器時橫向捲動)
  const total = widths ? Object.values(widths).reduce((s, w) => s + w, 0) : 0;
  const sc = widths ? { ...(scroll ?? {}), x: total } : scroll;

  return (
    <AntTable<T> {...rest} columns={cols} scroll={sc}
      tableLayout={widths ? "fixed" : tableLayout}
      components={{ ...components, header: { ...components?.header, cell: ResizableHeaderCell } }} />
  );
}
