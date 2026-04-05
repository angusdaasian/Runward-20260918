import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Lang } from "@/lib/i18n";
import { useState } from "react";

const Privacy = () => {
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

  return (
    <div className="min-h-screen bg-background px-5 pt-6 max-w-lg mx-auto pb-10">
      <button onClick={handleReturn} className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
        <ArrowLeft size={16} />
        {lang === "zh" ? "返回" : "Back"}
      </button>

      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck size={24} className="text-primary" />
        <h1 className="font-display text-2xl font-bold text-foreground">
          {lang === "zh" ? "隱私權政策" : "Privacy Policy"}
        </h1>
      </div>

      <div className="space-y-5 text-sm text-muted-foreground leading-relaxed">
        <p className="text-xs text-muted-foreground">
          {lang === "zh" ? "最後更新日期：2026 年 3 月" : "Last updated: March 2026"}
        </p>

        <section>
          <h2 className="font-semibold text-foreground mb-2">{lang === "zh" ? "1. 簡介" : "1. Introduction"}</h2>
          <p>
            {lang === "zh"
              ? "向前跑（RunWard）重視您的隱私。本隱私權政策說明我們如何收集、使用和保護您的個人資訊。"
              : "RunWard values your privacy. This Privacy Policy explains how we collect, use, and protect your personal information."}
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">
            {lang === "zh" ? "2. 我們收集的資訊" : "2. Information We Collect"}
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              {lang === "zh" ? "帳戶資訊：電子郵件地址、顯示名稱" : "Account information: email address, display name"}
            </li>
            <li>
              {lang === "zh" ? "個人檔案資訊：年齡、性別、每週跑步次數" : "Profile data: age, sex, runs per week"}
            </li>
            <li>
              {lang === "zh" ? "訓練資料：個人最佳成績、訓練計畫" : "Training data: personal bests, training plans"}
            </li>
            <li>
              {lang === "zh"
                ? "姿勢分析：上傳的影片僅用於分析，不會永久儲存"
                : "Posture analysis: uploaded videos are used for analysis only and are not permanently stored"}
            </li>
            <li>
              {lang === "zh"
                ? "Strava 資料：活動指標（距離、配速、心率），僅在您授權後獲取"
                : "Strava Data: Activity metrics (distance, pace, heart rate), accessed only via user authorization"}
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">
            {lang === "zh" ? "3. Strava API 與 AI 政策" : "3. Strava API & AI Policy"}
          </h2>
          <p className="mb-2">
            {lang === "zh"
              ? "3. 我們嚴格遵守 Strava 的 API 服務條款："
              : "We strictly adhere to Strava's API Terms of Service:"}
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              {lang === "zh"
                ? "禁止 AI 訓練：我們絕對不會使用從 Strava 獲取的資料來訓練、改進或測試任何 AI 或機器學習模型。"
                : "No AI Training: We strictly do NOT use data accessed via the Strava API to train, improve, or test any AI or machine learning models."}
            </li>
            <li>
              {lang === "zh"
                ? "僅限運動員查看：您的 Strava 資料僅顯示在您的個人儀表板中，絕不會與其他用戶或第三方分享。"
                : "Athlete-Only Display: Your Strava data is displayed only within your personal dashboard and is never shared with other users or third parties."}
            </li>
            <li>
              {lang === "zh"
                ? "Smart Insights：此功能僅為您個人提供活動摘要，不涉及模型訓練。"
                : "Smart Insights: This feature provides personal activity summaries for your eyes only and does not involve model training."}
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">
            {lang === "zh" ? "4. 我們如何使用您的資訊" : "3. How We Use Your Information"}
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>{lang === "zh" ? "提供並改善我們的服務" : "To provide and improve our services"}</li>
            <li>{lang === "zh" ? "生成個人化訓練計畫" : "To generate personalized training plans"}</li>
            <li>{lang === "zh" ? "進行跑步姿勢分析" : "To perform running posture analysis"}</li>
            <li>{lang === "zh" ? "管理您的訂閱和帳戶" : "To manage your subscription and account"}</li>
            <li>
              {lang === "zh"
                ? "追蹤訓練進度（使用 Strava API 資料進行視覺化）"
                : "To track training progress (using Strava API data for visualization)"}
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">
            {lang === "zh" ? "5. 資料儲存與安全" : "4. Data Storage & Security"}
          </h2>
          <p>
            {lang === "zh"
              ? "您的資料安全地儲存在加密的雲端伺服器上。我們採用業界標準的安全措施來保護您的個人資訊。"
              : "Your data is securely stored on encrypted cloud servers. We use industry-standard security measures to protect your personal information."}
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">
            {lang === "zh" ? "6. 第三方服務" : "5. Third-Party Services"}
          </h2>
          <p>
            {lang === "zh"
              ? "我們可能使用第三方服務（如付款處理、分析工具）來運營我們的應用程式。這些服務有各自的隱私政策。"
              : "We may use third-party services (such as payment processors, analytics tools) to operate our app. These services have their own privacy policies."}
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">{lang === "zh" ? "7. 您的權利" : "6. Your Rights"}</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>{lang === "zh" ? "存取和更新您的個人資料" : "Access and update your personal data"}</li>
            <li>{lang === "zh" ? "要求刪除您的帳戶和資料" : "Request deletion of your account and data"}</li>
            <li>{lang === "zh" ? "隨時退出選擇性資料收集" : "Opt out of optional data collection at any time"}</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">{lang === "zh" ? "8. 使用條款" : "7. Terms of Use"}</h2>
          <p>
            {lang === "zh"
              ? "本應用程式受 Apple 標準終端使用者授權協議（EULA）約束："
              : "This app is subject to Apple's Standard End User License Agreement (EULA):"}
          </p>
          <a
            href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary font-medium break-all"
          >
            https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
          </a>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">{lang === "zh" ? "9. 聯繫我們" : "8. Contact Us"}</h2>
          <p>
            {lang === "zh"
              ? "如有任何隱私相關問題，請聯繫我們："
              : "For any privacy-related questions, please contact us at:"}
          </p>
          <a href="mailto:runwardsupport@gmail.com" className="text-primary font-medium">
            runwardsupport@gmail.com
          </a>
        </section>
      </div>
    </div>
  );
};

export default Privacy;
