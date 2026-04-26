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
          {lang === "zh" ? "最後更新日期：2026 年 4 月" : "Last updated: April 2026"}
        </p>

        <section>
          <h2 className="font-semibold text-foreground mb-2">{lang === "zh" ? "1. 簡介" : "1. Introduction"}</h2>
          <p>
            {lang === "zh"
              ? "向前跑（RunWard）重視您的隱私。本隱私權政策說明我們如何收集、使用和保護您的個人資訊,以及我們提供的所有功能(包括 AI 跑步教練、姿勢分析、訓練計畫、活動同步、賽事與獎勵系統)如何處理您的資料。"
              : "RunWard values your privacy. This Privacy Policy explains how we collect, use, and protect your personal information across all features — including the AI Running Coach, posture analysis, training plans, activity sync, races, and the rewards system."}
          </p>
        </section>

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
              {lang === "zh" ? "帳戶資訊：電子郵件地址、顯示名稱、頭像" : "Account information: email address, display name, avatar"}
            </li>
            <li>
              {lang === "zh" ? "個人檔案資訊：年齡、性別、每週跑步次數、每月目標距離" : "Profile data: age, sex, runs per week, monthly distance goal"}
            </li>
            <li>
              {lang === "zh" ? "訓練資料：個人最佳成績、訓練計畫、訓練分數" : "Training data: personal bests, training plans, training score"}
            </li>
            <li>
              {lang === "zh"
                ? "活動資料：GPS 路線、配速、心率、海拔、步頻、卡路里"
                : "Activity data: GPS routes, pace, heart rate, elevation, cadence, calories"}
            </li>
            <li>
              {lang === "zh"
                ? "第三方健身整合：Strava、Garmin Connect（加密儲存的登入憑證以供同步）、COROS（手動 .fit 檔案上傳）、Apple Health（透過 HealthKit 取得 iOS 上的步數、心率、運動資料）"
                : "Third-party fitness integrations: Strava, Garmin Connect (login credentials encrypted for sync), COROS (manual .fit file uploads), and Apple Health (steps, heart rate, workouts via HealthKit on iOS)"}
            </li>
            <li>
              {lang === "zh"
                ? "姿勢分析：上傳的影片僅用於即時分析與畫面擷取，分析完成後立即丟棄，絕不永久儲存"
                : "Posture analysis: uploaded videos are processed for frame extraction and analysis, then immediately discarded — they are never permanently stored"}
            </li>
            <li>
              {lang === "zh"
                ? "位置/城市偏好：您輸入用於天氣的城市名稱僅儲存於您的裝置本機"
                : "Location/city preference: the city name you enter for weather is stored locally on your device only"}
            </li>
            <li>
              {lang === "zh"
                ? "賽事提交：賽事名稱、距離、完賽時間、選擇性的驗證照片"
                : "Race submissions: race name, distance, finish time, and optional verification photo"}
            </li>
            <li>
              {lang === "zh"
                ? "獎勵與經驗值資料：每日簽到、排行榜排名、獎勵代碼兌換紀錄"
                : "Rewards & XP data: daily check-ins, leaderboard rank, reward code redemptions"}
            </li>
            <li>
              {lang === "zh"
                ? "訂閱資料：購買收據與會員權限狀態（透過 Apple App Store 處理）"
                : "Subscription data: purchase receipts and entitlement status (processed via Apple App Store)"}
            </li>
            <li>
              {lang === "zh"
                ? "推播通知權杖：用於每日訓練提醒的裝置權杖（需選擇加入）"
                : "Push notification tokens: device tokens used for daily training reminders (opt-in)"}
            </li>
            <li>
              {lang === "zh"
                ? "支援回饋：您透過支援表單提交的姓名、標題與描述"
                : "Support feedback: name, title, and description you submit via the Support form"}
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">
            {lang === "zh" ? "3. 第三方健身資料政策" : "3. Third-Party Fitness Data Policy"}
          </h2>
          <p className="mb-2">
            {lang === "zh"
              ? "我們嚴格遵守 Strava、Garmin、COROS 與 Apple Health 的服務條款。以下原則同樣適用於所有第三方健身資料："
              : "We strictly adhere to the terms of service of Strava, Garmin, COROS, and Apple Health. The following principles apply to all third-party fitness data:"}
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              {lang === "zh"
                ? "禁止 AI 訓練：我們絕對不會使用透過 Strava、Garmin、COROS 或 Apple Health 取得的資料來訓練、改進或測試任何 AI 或機器學習模型。"
                : "No AI Training: We strictly do NOT use data accessed via Strava, Garmin, COROS, or Apple Health to train, improve, or test any AI or machine learning models."}
            </li>
            <li>
              {lang === "zh"
                ? "僅限運動員查看：您的健身資料僅顯示於您的個人儀表板中，絕不會與其他用戶或第三方分享。"
                : "Athlete-Only Display: Your fitness data is displayed only within your personal dashboard and is never shared with other users or third parties."}
            </li>
            <li>
              {lang === "zh"
                ? "智慧洞察：此功能僅為您個人提供活動摘要，不涉及模型訓練。"
                : "Smart Insights: This feature provides personal activity summaries for your eyes only and does not involve model training."}
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">
            {lang === "zh" ? "4. AI 與天氣服務" : "4. AI & Weather Services"}
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              {lang === "zh"
                ? "我們提供 AI 驅動的功能，包括姿勢分析、活動分析、建議訓練與訓練計畫生成。"
                : "We provide AI-powered features including posture analysis, activity analysis, suggested workouts, and training plan generation."}
            </li>
            <li>
              {lang === "zh"
                ? "我們提供天氣與每小時預報服務；您選擇的城市會用來取得當地天氣狀況。"
                : "We provide weather and hourly forecast services; the city you select is used to retrieve local conditions."}
            </li>
            <li>
              {lang === "zh"
                ? "在「最佳跑步時間」建議中，當前天氣與每小時預報會與您近期的訓練摘要一同提供給 AI，以生成個人化建議。"
                : "For \"Best time to run\" suggestions, current weather and hourly forecast are sent alongside your recent training summary to generate personalized recommendations."}
            </li>
            <li>
              {lang === "zh"
                ? "您的資料絕不會被用於 AI 模型訓練。"
                : "Your data is never used for AI model training."}
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">
            {lang === "zh" ? "5. 我們如何使用您的資訊" : "5. How We Use Your Information"}
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>{lang === "zh" ? "提供並改善我們的服務" : "To provide and improve our services"}</li>
            <li>{lang === "zh" ? "生成個人化訓練計畫與建議訓練" : "To generate personalized training plans and suggested workouts"}</li>
            <li>{lang === "zh" ? "進行跑步姿勢分析" : "To perform running posture analysis"}</li>
            <li>{lang === "zh" ? "提供天氣感知的跑步建議（包括最佳跑步時間）" : "To provide weather-aware run suggestions (including best time to run)"}</li>
            <li>{lang === "zh" ? "管理您的訂閱和帳戶" : "To manage your subscription and account"}</li>
            <li>
              {lang === "zh"
                ? "追蹤訓練進度（使用第三方健身資料進行視覺化）"
                : "To track training progress (using third-party fitness data for visualization)"}
            </li>
            <li>{lang === "zh" ? "傳送每日訓練推播提醒（需選擇加入）" : "To send daily training push reminders (opt-in)"}</li>
            <li>{lang === "zh" ? "管理排行榜、經驗值與獎勵系統" : "To operate leaderboards, XP, and the rewards system"}</li>
            <li>{lang === "zh" ? "驗證使用者提交的賽事成績" : "To verify user-submitted race results"}</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">
            {lang === "zh" ? "6. 訂閱與付款" : "6. Subscriptions & Payments"}
          </h2>
          <p>
            {lang === "zh"
              ? "所有付款皆透過 Apple App Store 安全處理。我們僅接收會員權限狀態與購買收據，絕不會接收或儲存您的信用卡資訊。"
              : "All payments are securely processed through the Apple App Store. We only receive entitlement status and purchase receipts — we never receive or store your credit card details."}
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">
            {lang === "zh" ? "7. 推播通知" : "7. Push Notifications"}
          </h2>
          <p>
            {lang === "zh"
              ? "推播通知為選擇加入功能,主要用於每日早晨的訓練提醒。您可以隨時在 iOS「設定」中停用通知。"
              : "Push notifications are opt-in and primarily used for daily morning training reminders. You can disable notifications at any time in your iOS Settings."}
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">
            {lang === "zh" ? "8. 資料儲存與安全" : "8. Data Storage & Security"}
          </h2>
          <p>
            {lang === "zh"
              ? "您的資料安全地儲存在加密的雲端伺服器上。我們採用業界標準的安全措施來保護您的個人資訊,包括傳輸加密與靜態加密。"
              : "Your data is securely stored on encrypted cloud servers. We use industry-standard security measures — including encryption in transit and at rest — to protect your personal information."}
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">
            {lang === "zh" ? "9. 資料保留與刪除" : "9. Data Retention & Deletion"}
          </h2>
          <p>
            {lang === "zh"
              ? "刪除帳戶時,我們會移除您的個人檔案、活動、姿勢分析、賽事提交與獎勵資料。姿勢分析影片從不保留,天氣城市偏好僅儲存於您的裝置本機。"
              : "When you delete your account, we remove your profile, activities, posture analyses, race submissions, and rewards data. Posture analysis videos are never retained, and your weather city preference stays on your device only."}
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">
            {lang === "zh" ? "10. 第三方服務" : "10. Third-Party Services"}
          </h2>
          <p>
            {lang === "zh"
              ? "我們整合下列第三方服務以提供 RunWard 的功能:Strava、Garmin Connect、COROS、Apple HealthKit、Apple 登入,以及 Apple App Store(訂閱)。這些服務各自擁有自己的隱私政策。"
              : "We integrate the following third-party services to power RunWard's features: Strava, Garmin Connect, COROS, Apple HealthKit, Sign in with Apple, and the Apple App Store (subscriptions). Each of these services has its own privacy policy."}
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">{lang === "zh" ? "11. 您的權利" : "11. Your Rights"}</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>{lang === "zh" ? "存取和更新您的個人資料" : "Access and update your personal data"}</li>
            <li>{lang === "zh" ? "要求刪除您的帳戶和資料" : "Request deletion of your account and data"}</li>
            <li>{lang === "zh" ? "隨時退出選擇性資料收集" : "Opt out of optional data collection at any time"}</li>
            <li>{lang === "zh" ? "隨時中斷與第三方健身服務的連線" : "Disconnect from third-party fitness services at any time"}</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">
            {lang === "zh" ? "12. 兒童隱私" : "12. Children's Privacy"}
          </h2>
          <p>
            {lang === "zh"
              ? "本服務並非針對 13 歲以下兒童設計。我們不會在知情的情況下蒐集兒童的個人資訊。"
              : "This service is not directed at children under the age of 13. We do not knowingly collect personal information from children."}
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-foreground mb-2">{lang === "zh" ? "13. 使用條款" : "13. Terms of Use"}</h2>
          <p>
            {lang === "zh"
              ? "本應用程式受 Apple 標準終端使用者授權協議(EULA)約束:"
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
          <h2 className="font-semibold text-foreground mb-2">{lang === "zh" ? "14. 聯繫我們" : "14. Contact Us"}</h2>
          <p>
            {lang === "zh"
              ? "如有任何隱私相關問題,請聯繫我們:"
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
