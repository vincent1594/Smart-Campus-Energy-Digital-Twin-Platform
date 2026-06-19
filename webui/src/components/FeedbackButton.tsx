// 右下角浮動「意見回饋」按鈕 → 星等(必)+ 感想(選)+ 身分(選)。
// 一人(visitor_id)一則、可更新:開啟時預填自己既有的評分。明細僅管理者可看。
import { CommentOutlined } from "@ant-design/icons";
import { Input, Modal, Rate, Select, message } from "antd";
import { useState } from "react";
import { api } from "../api/client";

const ROLES = ["營繕組", "總務處", "長官", "老師", "學生", "訪客", "其他"];

function visitorId(): string {
  let vid = localStorage.getItem("bg_visitor_id");
  if (!vid) { vid = (crypto.randomUUID?.() ?? String(Math.random()).slice(2)); localStorage.setItem("bg_visitor_id", vid); }
  return vid;
}

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [role, setRole] = useState<string>();
  const [edited, setEdited] = useState(false);   // 是否曾評過(顯示「更新」字樣)
  const [saving, setSaving] = useState(false);

  const openModal = async () => {
    setOpen(true);
    try {
      const mine = await api.myFeedback(visitorId());
      if (mine) { setRating(mine.rating); setComment(mine.comment); setRole(mine.role || undefined); setEdited(true); }
      else { setRating(0); setComment(""); setRole(undefined); setEdited(false); }
    } catch { /* 預填失敗就空白開始 */ }
  };

  const submit = async () => {
    if (!rating) { message.warning("請先給個星等"); return; }
    setSaving(true);
    try {
      await api.submitFeedback(visitorId(), rating, comment.trim(), role ?? "");
      message.success(edited ? "已更新你的回饋,謝謝!" : "謝謝你的回饋!");
      setOpen(false);
    } catch (e) {
      message.error(`送出失敗:${String((e as Error).message ?? e)}`);
    } finally { setSaving(false); }
  };

  return (
    <>
      {/* 頂部列連結(不浮動、不擋頁面內容) */}
      <a onClick={openModal} title="意見回饋"
        style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
        <CommentOutlined /><span>意見回饋</span>
      </a>

      <Modal open={open} title="意見回饋" onCancel={() => setOpen(false)} width={440}
        okText={edited ? "更新" : "送出"} confirmLoading={saving} onOk={submit}>
        <div style={{ padding: "4px 0 2px" }}>
          <div style={{ marginBottom: 4, color: "#555" }}>整體評分 <span style={{ color: "#ff4d4f" }}>*</span></div>
          <Rate value={rating} onChange={setRating} style={{ fontSize: 30 }} />
          {rating > 0 && <span style={{ marginLeft: 10, color: "#faad14" }}>{rating} 星</span>}

          <div style={{ margin: "16px 0 4px", color: "#555" }}>你的身分 <span style={{ color: "#bbb" }}>(選填)</span></div>
          <Select allowClear placeholder="選擇身分" value={role} onChange={setRole} style={{ width: "100%" }}
            options={ROLES.map((r) => ({ label: r, value: r }))} />

          <div style={{ margin: "16px 0 4px", color: "#555" }}>感想 / 建議 <span style={{ color: "#bbb" }}>(選填)</span></div>
          <Input.TextArea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} maxLength={1000} showCount
            placeholder="哪裡好用、哪裡可以更好、想要什麼功能…" />

          {edited && <div style={{ marginTop: 8, fontSize: 12, color: "#999" }}>你先前已評過,送出會更新這則。</div>}
        </div>
      </Modal>
    </>
  );
}
