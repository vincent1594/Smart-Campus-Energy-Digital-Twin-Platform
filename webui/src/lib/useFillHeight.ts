// 讓表格(或任何元素)自動填滿到視窗底部的可用高度,免去各頁寫死 calc(100vh - NNN)。
// 用法:const fh = useFillHeight(); <div ref={fh.ref}><Table scroll={{ y: fh.height }} /></div>
// offset = 表格下方還需保留的空間(分頁列、註腳…)。
import { useEffect, useRef, useState } from "react";

export function useFillHeight(offset = 64) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(420);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const top = el.getBoundingClientRect().top;
      if (top > 0) setHeight(Math.max(180, Math.round(window.innerHeight - top - offset)));
    };
    update();
    const ro = new ResizeObserver(update);   // 元素由隱藏→顯示(切分頁)會觸發,重新量測
    ro.observe(el);
    ro.observe(document.body);
    window.addEventListener("resize", update);
    return () => { ro.disconnect(); window.removeEventListener("resize", update); };
  }, [offset]);
  return { ref, height };
}
