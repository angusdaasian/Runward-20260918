/**
 * RunWard changelog. Newest first.
 * Versioning: big changes bump the major number (X.0); small tweaks bump the minor (x.N).
 * Every shipped update must add an entry here.
 */
export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM-DD
  major?: boolean;
  en: { title: string; items: string[] };
  zh: { title: string; items: string[] };
}

export const CHANGELOG: ChangelogEntry[] = [
  { version: "6.9", date: "2026-10-04", en: { title: "Routes", items: ["New Routes page in Training with routes shared publicly by runners", "Tap the map to zoom in and explore the route", "Filter shared routes by country or region, with Chinese region names", "Send a route to your Garmin watch or download the GPX"] }, zh: { title: "路線", items: ["訓練新增「路線」頁面，瀏覽跑者公開分享的路線", "點擊地圖可放大檢視路線", "可按國家或地區篩選公開路線，地區名稱以中文顯示", "可傳送路線到 Garmin 手錶或下載 GPX"] } },
  { version: "6.8", date: "2026-10-04", en: { title: "Smarter interval detection", items: ["Fixed the smart interval detection"] }, zh: { title: "智能間歇偵測修正", items: ["修正智能間歇偵測"] } },
  { version: "6.7", date: "2026-10-04", en: { title: "Smoother watch connections", items: ["New watch connections import your past 30 days automatically with auto sync on", "Consent page follows your in-app language", "Suunto can now be connected alongside your watch", "Full-history import hidden once it has completed"] }, zh: { title: "更順暢的手錶連接", items: ["新連接手錶時自動匯入過去 30 天活動並開啟自動同步", "授權頁面跟隨應用程式語言", "Suunto 可與手錶同時連接", "完成全部歷史匯入後隱藏該選項"] } },
  { version: "6.6", date: "2026-10-02", en: { title: "Announcements", items: ["Info, Important and Urgent announcements on Home", "Activity type filter in All Activities", "Monthly challenge and share card count runs only"] }, zh: { title: "公告系統", items: ["首頁顯示一般、重要及緊急公告", "全部活動可按類型篩選", "每月挑戰及分享卡只計算跑步"] } },
  { version: "6.5", date: "2026-10-01", en: { title: "Pace zones & City Hunter auto sync", items: ["Pace zone widget and per-activity time in pace zone", "City Hunter updates automatically after every new activity", "Cleaner notification registrations"] }, zh: { title: "配速區間與城市獵人自動同步", items: ["配速區間小工具及每次活動的配速區間分佈", "城市獵人在每次新活動後自動更新", "整理推送通知登記"] } },
  { version: "6.4", date: "2026-09-29", en: { title: "Program completion report", items: ["Finished AI programs move to Past programs", "One-time AI completion report: key sessions, race vs target, strengths and improvements"] }, zh: { title: "訓練計劃完成報告", items: ["完成的 AI 計劃移至過往計劃", "AI 完成報告：關鍵課表、比賽成績對比目標、強項與改進"] } },
  { version: "6.3", date: "2026-09-28", en: { title: "Race time detection", items: ["Race result picks the run closest to the race distance, not the warm-up", "AI features moved to a new account for reliability"] }, zh: { title: "比賽時間偵測", items: ["比賽成績選取最接近賽事距離的跑步，而非熱身", "AI 功能轉用新帳戶，更穩定"] } },
  { version: "6.2", date: "2026-09-27", en: { title: "Notifications in your language", items: ["All activity notifications follow the language chosen in More settings", "Activity alerts for watch connections"] }, zh: { title: "通知跟隨應用語言", items: ["所有活動通知跟隨「更多」設定中的語言", "手錶連接新增活動通知"] } },
  { version: "6.1", date: "2026-09-26", en: { title: "Health data from your watch", items: ["Daily steps, resting heart rate, HRV, sleep and VO₂max", "Apple Health sleep preferred on Home"] }, zh: { title: "手錶健康數據", items: ["每日步數、靜息心率、HRV、睡眠及最大攝氧量", "首頁優先顯示 Apple 健康睡眠"] } },
  { version: "6.0", date: "2026-09-24", major: true, en: { title: "New watch connections", items: ["Garmin, COROS, Polar, Fitbit and Zepp/Amazfit connect through one new service", "Automatic sync, accurate cadence and five-year history import for Premium", "Duplicate activities hidden automatically, never deleted"] }, zh: { title: "全新手錶連接", items: ["Garmin、COROS、Polar、Fitbit 及 Zepp/Amazfit 統一連接", "自動同步、準確步頻，Premium 可匯入五年歷史", "自動隱藏重複活動，絕不刪除"] } },
  { version: "5.4", date: "2026-09-23", en: { title: "Service status", items: ["Home shows problems with connected services only", "Restored the Garmin connection flow"] }, zh: { title: "服務狀態", items: ["首頁只顯示已連接服務的問題", "恢復 Garmin 連接流程"] } },
  { version: "5.3", date: "2026-09-17", en: { title: "Personal page & sharing", items: ["Personal page redesigned as a category hub", "Personal Bests and Heart Rate Zones on More", "Drag and resize stats on photo share cards"] }, zh: { title: "個人頁面與分享", items: ["個人頁面重新設計為分類中心", "「更多」顯示個人最佳及心率區間", "相片分享卡可拖動及縮放數據"] } },
  { version: "5.2", date: "2026-09-15", en: { title: "Group chat & smart intervals", items: ["Private chat inside each running group", "Smart interval detection", "Run start times and group names in feeds"] }, zh: { title: "群組聊天與智能間歇", items: ["跑團內私人聊天", "智能間歇偵測", "動態顯示起跑時間及群組名稱"] } },
  { version: "5.1", date: "2026-09-12", en: { title: "Social running", items: ["Likes and comments on runs", "Per-group \"friend just ran\" alerts", "Shared race-time prediction across the app"] }, zh: { title: "社交跑步", items: ["跑步可按讚及留言", "每個群組可設「朋友剛跑完」通知", "全應用統一比賽時間預測"] } },
  { version: "5.0", date: "2026-09-11", major: true, en: { title: "Community revamp", items: ["Monthly kilometre leaderboards (opt-in)", "Private groups with invite links and QR codes", "Nearby social running wall with privacy controls"] }, zh: { title: "社群全面改版", items: ["每月公里排行榜（自願參加）", "私人群組，可用邀請連結及二維碼加入", "附近跑者動態牆及私隱設定"] } },
  { version: "4.6", date: "2026-09-01", en: { title: "Program auto-adjust", items: ["AI program adjusts to your training", "No duplicate interval sessions after recalibration"] }, zh: { title: "計劃自動調整", items: ["AI 計劃根據訓練自動調整", "重新校準後不再出現重複間歇課"] } },
  { version: "4.4", date: "2026-08-20", en: { title: "Blog & calculators", items: ["Running blog in English and Chinese", "Updated running calculators"] }, zh: { title: "跑步文章與計算機", items: ["中英文跑步文章", "更新跑步計算機"] } },
  { version: "4.3", date: "2026-07-09", en: { title: "Native sharing", items: ["Native share sheet", "WhatsApp message templates for analysis and daily workouts"] }, zh: { title: "原生分享", items: ["使用系統分享頁面", "WhatsApp 分析及每日課表訊息"] } },
  { version: "4.2", date: "2026-06-16", en: { title: "Smarter AI coach", items: ["Upgraded AI coach and activity analysis model", "Coach suggestions update your schedule", "Refreshed race list"] }, zh: { title: "更聰明的 AI 教練", items: ["升級 AI 教練及活動分析模型", "教練建議可直接更新課表", "更新賽事列表"] } },
  { version: "4.1", date: "2026-06-12", en: { title: "intervals.icu & Polar", items: ["Connect intervals.icu", "Official Polar connection", "Desktop posture analysis"] }, zh: { title: "intervals.icu 與 Polar", items: ["連接 intervals.icu", "官方 Polar 連接", "桌面版姿勢分析"] } },
  { version: "4.0", date: "2026-06-11", major: true, en: { title: "AI coach on WhatsApp & Telegram", items: ["Chat with your AI coach on Telegram and WhatsApp", "Rate your effort (RPE) by reply for AI analysis", "Local pricing in HKD and TWD"] }, zh: { title: "WhatsApp 及 Telegram AI 教練", items: ["在 Telegram 及 WhatsApp 與 AI 教練對話", "回覆 RPE 即可獲得 AI 分析", "以港幣及新台幣顯示價格"] } },
  { version: "3.2", date: "2026-06-05", en: { title: "First-run walkthrough", items: ["Guided walkthrough for new users", "\"What's new\" in the menu"] }, zh: { title: "新手導覽", items: ["新用戶導覽", "選單新增「最新消息」"] } },
  { version: "3.1", date: "2026-06-03", en: { title: "Simple mode", items: ["Simple mode toggle", "Connect prompt when no fitness app is linked"] }, zh: { title: "簡易模式", items: ["簡易模式開關", "未連接健身應用時顯示提示"] } },
  { version: "3.0", date: "2026-06-02", major: true, en: { title: "Strava & desktop dashboard", items: ["Strava connection", "Desktop dashboard", "Promo codes on Android"] }, zh: { title: "Strava 與桌面版", items: ["連接 Strava", "桌面版儀表板", "Android 優惠碼"] } },
  { version: "2.5", date: "2026-05-29", en: { title: "Monthly share card", items: ["Monthly stats share card", "Export activities as .fit files", "Revamped nutrition guide"] }, zh: { title: "每月分享卡", items: ["每月統計分享卡", "匯出 .fit 活動檔案", "全新補給指南"] } },
  { version: "2.4", date: "2026-05-18", en: { title: "Trail running", items: ["Trail and Trail Race categories", "Premium full activity sync", "New running avatars"] }, zh: { title: "越野跑", items: ["新增越野及越野賽類別", "Premium 完整活動同步", "全新跑者頭像"] } },
  { version: "2.3", date: "2026-05-15", en: { title: "3D route flyover", items: ["3D terrain map with animated flyover", "New tab navigation"] }, zh: { title: "3D 路線飛越", items: ["3D 地形地圖及路線飛越動畫", "全新分頁導覽"] } },
  { version: "2.2", date: "2026-05-09", en: { title: "Fitness Score & posture", items: ["Fitness Score", "AI posture analysis limits for free and Premium", "Elevation in AI activity analysis", "Editable onboarding info"] }, zh: { title: "體能分數與姿勢", items: ["體能分數", "AI 姿勢分析免費與 Premium 次數", "AI 活動分析加入海拔", "可修改註冊資料"] } },
  { version: "2.1", date: "2026-05-08", en: { title: "City Hunter", items: ["Claim map hexes by running, with city progress and landmarks", "Weekly run summary in calendar", "Activity and chart share cards"] }, zh: { title: "城市獵人", items: ["跑步佔領地圖格，顯示城市進度及地標", "日曆每週跑步統計", "活動及圖表分享卡"] } },
  { version: "2.0", date: "2026-05-04", major: true, en: { title: "Watch sync", items: ["Garmin, COROS and Suunto activities with maps, splits and heart rate", "Daily health stats", "New activity notifications"] }, zh: { title: "手錶同步", items: ["Garmin、COROS 及 Suunto 活動，含地圖、分段及心率", "每日健康數據", "新活動通知"] } },
  { version: "1.4", date: "2026-05-01", en: { title: "Races", items: ["My Races with A/B/C goal priority", "Premium subscriptions"] }, zh: { title: "比賽", items: ["我的比賽，可設定 A/B/C 目標", "Premium 訂閱"] } },
  { version: "1.3", date: "2026-04-25", en: { title: "Training load", items: ["Training load for every activity", "AI coach chat", "Weather with best time to run"] }, zh: { title: "訓練負荷", items: ["每次活動訓練負荷", "AI 教練聊天", "天氣及最佳跑步時間"] } },
  { version: "1.2", date: "2026-04-13", en: { title: "Fitness app connections", items: ["Apple Health workouts", "Connect apps page", "AI activity analysis"] }, zh: { title: "健身應用連接", items: ["Apple 健康體能訓練", "連接應用頁面", "AI 活動分析"] } },
  { version: "1.1", date: "2026-04-06", en: { title: "Rewards & notifications", items: ["XP rewards and redeem codes", "Push notifications", "Goal pace input in calculators"] }, zh: { title: "獎勵與通知", items: ["經驗值獎勵及兌換碼", "推送通知", "計算機可輸入目標配速"] } },
  { version: "1.0", date: "2026-04-05", major: true, en: { title: "RunWard launches", items: ["Running calculators", "Email and Google sign-in", "Landing page"] }, zh: { title: "向前跑正式推出", items: ["跑步計算機", "電郵及 Google 登入", "首頁"] } },
];

export const CURRENT_VERSION = CHANGELOG[0].version;
