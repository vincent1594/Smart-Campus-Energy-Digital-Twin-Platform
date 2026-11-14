// 開場登入卡:浮在開場動畫之上,登入成功才放行進場(硬閘門)。
// 動畫在背景繼續跑;登入成功後本卡卸載、露出開場的「進入系統」鈕接原本運鏡進場。
import { Button, Input, message } from "antd";
import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { useState } from "react";
import { useAuth } from "../auth/AuthContext";

export default function LoginCard({ onSuccess }: { onSuccess: () => void }) {
  const { login } = useAuth();
  const [acc, setAcc] = useState("");
  const [pwd, setPwd] = useState("");

  const submit = () => {
    if (login(acc, pwd)) {
      message.success("登入成功,進入系統…");
      onSuccess();   // 登入即放行(接開場運鏡進場),免等進入鈕的動畫延遲
    } else {
      message.error("帳號或密碼錯誤");
    }
  };

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 5, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      <div style={{ pointerEvents: "auto", width: 328, padding: "30px 28px",
        borderRadius: 16, background: "rgba(8,14,30,0.74)", backdropFilter: "blur(14px)",
        border: "1px solid rgba(120,160,255,0.28)", boxShadow: "0 16px 56px rgba(0,0,0,0.55)", color: "#dce8ff" }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: 3, textAlign: "center" }}>南台配電數位孿生</div>
        <div style={{ fontSize: 12, color: "#7f93bf", textAlign: "center", margin: "6px 0 22px", letterSpacing: 1 }}>請登入以進入系統</div>

        <Input size="large" placeholder="帳號" prefix={<UserOutlined />} value={acc}
          onChange={(e) => setAcc(e.target.value)} style={{ marginBottom: 10 }} autoFocus />
        <Input.Password size="large" placeholder="密碼" prefix={<LockOutlined />} value={pwd}
          onChange={(e) => setPwd(e.target.value)} onPressEnter={submit} style={{ marginBottom: 18 }} />
        <Button type="primary" size="large" block onClick={submit}>登入</Button>

        <div style={{ fontSize: 10.5, color: "#5f74a0", marginTop: 16, lineHeight: 1.7, textAlign: "center" }}>
          展示用前端驗證,非真實安全。<br />
          管理者 <b style={{ color: "#8fa6d8" }}>admin</b>　·　總務處 <b style={{ color: "#8fa6d8" }}>ga</b>
        </div>
      </div>
    </div>
  );
}
