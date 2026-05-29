import { ArrowLeft, Trash2, Mail, AlertTriangle, CheckCircle } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Lang } from "@/lib/i18n";
import { useState } from "react";

const DeleteAccount = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [lang] = useState<Lang>(() => (localStorage.getItem("app_lang") as Lang) || "en");
  const fallbackRoute = (location.state as { from?: string } | null)?.from || "/";

  const handleReturn = () => {
    if ((window.history.state?.idx ?? 0) > 0) {
      navigate(-1);
      return;
    }
    navigate(fallbackRoute, { replace: true });
  };

  const dataDeleted = lang === "zh" ? [
    "個人檔案與帳戶設定",
    "所有跑步活動與 GPS 資料",
    "心率區間與訓練數據",
    "AI 教練對話紀錄",
    "訓練計畫與個人最佳紀錄",
    "第三方連線授權（Strava、Garmin、COROS）",
    "訂閱與獎勵紀錄",
  ] : [
    "Profile and account settings",
    "All running activities and GPS data",
    "Heart rate zones and training metrics",
    "AI Coach conversation history",
    "Training plans and personal bests",
    "Third-party connections (Strava, Garmin, COROS)",
    "Subscription and rewards records",
  ];

  return (
    <div className="min-h-screen bg-background px-5 pt-6 max-w-lg mx-auto pb-10">
      <button onClick={handleReturn} className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
        <ArrowLeft size={16} />
        {lang === "zh" ? "返回" : "Back"}
      </button>

      <div className="flex items-center gap-3 mb-6">
        <Trash2 size={24} className="text-destructive" />
        <h1 className="font-display text-2xl font-bold text-foreground">
          {lang === "zh" ? "刪除帳戶" : "Delete Account"}
        </h1>
      </div>

      <div className="space-y-6">
        {/* Warning */}
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-foreground leading-relaxed">
            {lang === "zh"
              ? "刪除帳戶是永久且無法復原的操作。一旦刪除，所有資料將立即從我們的伺服器移除。"
              : "Deleting your account is permanent and cannot be undone. Once deleted, all data will be immediately removed from our servers."}
          </p>
        </div>

        {/* What gets deleted */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-foreground">
            {lang === "zh" ? "刪除帳戶時會一併移除以下資料：" : "The following data will be removed when you delete your account:"}
          </h2>
          <ul className="space-y-2">
            {dataDeleted.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle size={14} className="text-destructive shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* How to delete */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-foreground">
            {lang === "zh" ? "如何刪除帳戶" : "How to Delete Your Account"}
          </h2>
          <ol className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shrink-0">1</span>
              {lang === "zh" ? "開啟 RunWard App 並登入您的帳戶" : "Open the RunWard app and sign in to your account"}
            </li>
            <li className="flex items-start gap-2">
              <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shrink-0">2</span>
              {lang === "zh" ? "前往底部導航列的「更多」分頁" : "Go to the More tab in the bottom navigation"}
            </li>
            <li className="flex items-start gap-2">
              <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shrink-0">3</span>
              {lang === "zh" ? "向下捲動並點擊「刪除帳戶」按鈕" : "Scroll down and tap the Delete Account button"}
            </li>
            <li className="flex items-start gap-2">
              <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shrink-0">4</span>
              {lang === "zh" ? "確認刪除即可完成" : "Confirm the deletion to complete the process"}
            </li>
          </ol>
        </div>

        {/* Can't log in */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-foreground">
            {lang === "zh" ? "無法登入？" : "Can't Sign In?"}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {lang === "zh"
              ? "如果您無法登入 App 刪除帳戶，請聯繫我們的支援團隊，我們會協助您處理。"
              : "If you can't sign in to the app to delete your account, please contact our support team and we'll assist you."}
          </p>
          <a
            href="mailto:runwardsupport@gmail.com"
            className="flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-3 text-sm font-medium w-full justify-center"
          >
            <Mail size={16} />
            runwardsupport@gmail.com
          </a>
        </div>
      </div>
    </div>
  );
};

export default DeleteAccount;
