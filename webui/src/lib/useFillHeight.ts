// 依視窗可用高度算出表格「剛好放得下幾列」,讓每頁不需捲動、分頁列(1,2,3…)留在底部。
// 用法:const fit = useFitPageSize(); <div ref={fit.ref}><Table pagination={{ pageSize: fit.pageSize }} /></div>
// reserveBelow = 表格下方要保留的空間(分頁列、底部留白、註腳…)。
import { useEffect, useRef, useState } from "react";

export function useFitPageSize(reserveBelow = 72, rowH = 39, headerH = 39) {
  const ref = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const top = el.getBoundingClientRect().top;
      if (top <= 0) return;   // 隱藏中(未切到此分頁)不量測,保留上次值
      const avail = window.innerHeight - top - reserveBelow - headerH;
      setPageSize(Math.max(3, Math.floor(avail / rowH)));
    };
    update();
    const ro = new ResizeObserver(update);   // 由隱藏→顯示(切分頁)或視窗縮放都重算
    ro.observe(el);
    ro.observe(document.body);
    window.addEventListener("resize", update);
    return () => { ro.disconnect(); window.removeEventListener("resize", update); };
  }, [reserveBelow, rowH, headerH]);
  return { ref, pageSize };
}
