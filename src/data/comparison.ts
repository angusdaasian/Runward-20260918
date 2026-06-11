// Comparison data for Runward vs Garmin Connect / Strava.
// Pricing references (as of 2026-06):
//   - Garmin Connect+: ~US$6.99/mo, US$69.99/yr (https://www.garmin.com/en-US/p/connect-plus/)
//   - Strava Premium:  ~US$11.99/mo, US$79.99/yr (https://www.strava.com/premium)
// Prices vary by region; the page shows a footnote and links out.

export type Cell =
  | { kind: "yes"; note_en?: string; note_zh?: string }
  | { kind: "no"; note_en?: string; note_zh?: string }
  | { kind: "partial"; note_en?: string; note_zh?: string }
  | { kind: "text"; text_en: string; text_zh: string };

export interface FeatureRow {
  label_en: string;
  label_zh: string;
  runward: Cell;
  competitor_free: Cell;
  competitor_premium: Cell;
}

export interface CompetitorComparison {
  id: "garmin" | "strava";
  name: string;
  blurb_en: string;
  blurb_zh: string;
  free_label_en: string;
  free_label_zh: string;
  premium_label_en: string;
  premium_label_zh: string;
  premium_price_en: string;
  premium_price_zh: string;
  pricing_link: string;
  features: FeatureRow[];
}

const yes = (note_en?: string, note_zh?: string): Cell => ({ kind: "yes", note_en, note_zh });
const no = (note_en?: string, note_zh?: string): Cell => ({ kind: "no", note_en, note_zh });
const partial = (note_en: string, note_zh: string): Cell => ({ kind: "partial", note_en, note_zh });
const text = (text_en: string, text_zh: string): Cell => ({ kind: "text", text_en, text_zh });

export const RUNWARD_PRICE = {
  monthly_en: "≈ US$6.15 / mo",
  monthly_zh: "約 US$6.15 / 月",
  yearly_en: "≈ US$62 / yr",
  yearly_zh: "約 US$62 / 年",
};

export const garminComparison: CompetitorComparison = {
  id: "garmin",
  name: "Garmin Connect",
  blurb_en:
    "Garmin Connect is the companion app for Garmin watches. Connect+ adds AI insights and active intelligence, but locks much of it behind a Garmin device.",
  blurb_zh:
    "Garmin Connect 是 Garmin 手錶的官方應用程式。Connect+ 加入了部分 AI 洞察，但需搭配 Garmin 裝置使用。",
  free_label_en: "Garmin Connect (Free)",
  free_label_zh: "Garmin Connect（免費）",
  premium_label_en: "Garmin Connect+",
  premium_label_zh: "Garmin Connect+",
  premium_price_en: "≈ US$6.99 / mo · US$69.99 / yr",
  premium_price_zh: "約 US$6.99 / 月 · US$69.99 / 年",
  pricing_link: "https://www.garmin.com/en-US/p/connect-plus/",
  features: [
    {
      label_en: "Multi-brand watch sync (Garmin, Suunto, Coros, Polar, Apple Health, Strava)",
      label_zh: "多品牌手錶同步（Garmin、Suunto、Coros、Polar、Apple Health、Strava）",
      runward: yes(),
      competitor_free: partial("Garmin devices only", "僅限 Garmin 裝置"),
      competitor_premium: partial("Garmin devices only", "僅限 Garmin 裝置"),
    },
    {
      label_en: "Training load & HRV insights",
      label_zh: "訓練負荷與 HRV 洞察",
      runward: yes(),
      competitor_free: yes(),
      competitor_premium: yes(),
    },
    {
      label_en: "Race time predictor (all distances)",
      label_zh: "全距離比賽時間預測",
      runward: yes(),
      competitor_free: partial("Limited distances", "僅限特定距離"),
      competitor_premium: yes(),
    },
    {
      label_en: "AI running coach (24/7 chat)",
      label_zh: "AI 跑步教練（24/7 對話）",
      runward: yes(),
      competitor_free: no(),
      competitor_premium: no(),
    },
    {
      label_en: "AI activity analysis reports",
      label_zh: "AI 活動分析報告",
      runward: yes(),
      competitor_free: no(),
      competitor_premium: partial("Active Intelligence summaries", "Active Intelligence 摘要"),
    },
    {
      label_en: "AI-personalized training plans",
      label_zh: "AI 個人化訓練計劃",
      runward: yes(),
      competitor_free: partial("Generic Garmin Coach plans", "通用 Garmin Coach 計劃"),
      competitor_premium: partial("Generic Garmin Coach plans", "通用 Garmin Coach 計劃"),
    },
    {
      label_en: "Running form / posture analysis (video)",
      label_zh: "跑姿影片分析",
      runward: yes(),
      competitor_free: no(),
      competitor_premium: no(),
    },
    {
      label_en: "Social feed & leaderboards",
      label_zh: "社群動態與排行榜",
      runward: yes(),
      competitor_free: yes("Garmin Connections", "Garmin Connections"),
      competitor_premium: yes(),
    },
    {
      label_en: "Web dashboard",
      label_zh: "網頁版儀表板",
      runward: yes(),
      competitor_free: yes(),
      competitor_premium: yes(),
    },
    {
      label_en: "Works without buying a specific brand of watch",
      label_zh: "無需綁定特定品牌手錶",
      runward: yes(),
      competitor_free: no(),
      competitor_premium: no(),
    },
    {
      label_en: "Price",
      label_zh: "價格",
      runward: text("≈ US$6.15 / mo · ≈ US$62 / yr", "約 US$6.15 / 月 · 約 US$62 / 年"),
      competitor_free: text("Free", "免費"),
      competitor_premium: text("≈ US$6.99 / mo", "約 US$6.99 / 月"),
    },
  ],
};

export const stravaComparison: CompetitorComparison = {
  id: "strava",
  name: "Strava",
  blurb_en:
    "Strava is the social network for athletes. Premium unlocks segments, routes and training analytics — but the AI coaching and form analysis are not there.",
  blurb_zh:
    "Strava 是運動員的社群平台。Premium 解鎖路段、路線和訓練分析，但缺少 AI 教練與跑姿分析。",
  free_label_en: "Strava (Free)",
  free_label_zh: "Strava（免費）",
  premium_label_en: "Strava Premium",
  premium_label_zh: "Strava Premium",
  premium_price_en: "≈ US$11.99 / mo · US$79.99 / yr",
  premium_price_zh: "約 US$11.99 / 月 · US$79.99 / 年",
  pricing_link: "https://www.strava.com/premium",
  features: [
    {
      label_en: "Multi-brand watch sync",
      label_zh: "多品牌手錶同步",
      runward: yes(),
      competitor_free: yes(),
      competitor_premium: yes(),
    },
    {
      label_en: "Training load & HRV insights",
      label_zh: "訓練負荷與 HRV 洞察",
      runward: yes(),
      competitor_free: no(),
      competitor_premium: yes(),
    },
    {
      label_en: "Race time predictor (all distances)",
      label_zh: "全距離比賽時間預測",
      runward: yes(),
      competitor_free: no(),
      competitor_premium: partial("Selected distances", "僅限部分距離"),
    },
    {
      label_en: "AI running coach (24/7 chat)",
      label_zh: "AI 跑步教練（24/7 對話）",
      runward: yes(),
      competitor_free: no(),
      competitor_premium: no(),
    },
    {
      label_en: "AI activity analysis reports",
      label_zh: "AI 活動分析報告",
      runward: yes(),
      competitor_free: no(),
      competitor_premium: partial("Athlete Intelligence beta", "Athlete Intelligence Beta"),
    },
    {
      label_en: "AI-personalized training plans",
      label_zh: "AI 個人化訓練計劃",
      runward: yes(),
      competitor_free: no(),
      competitor_premium: no(),
    },
    {
      label_en: "Running form / posture analysis (video)",
      label_zh: "跑姿影片分析",
      runward: yes(),
      competitor_free: no(),
      competitor_premium: no(),
    },
    {
      label_en: "Segments & live segments",
      label_zh: "路段與即時路段",
      runward: no(),
      competitor_free: partial("View only", "僅可查看"),
      competitor_premium: yes(),
    },
    {
      label_en: "Heatmaps & route planner",
      label_zh: "熱力圖與路線規劃",
      runward: no(),
      competitor_free: no(),
      competitor_premium: yes(),
    },
    {
      label_en: "Social feed & leaderboards",
      label_zh: "社群動態與排行榜",
      runward: yes(),
      competitor_free: yes(),
      competitor_premium: yes(),
    },
    {
      label_en: "Web dashboard",
      label_zh: "網頁版儀表板",
      runward: yes(),
      competitor_free: yes(),
      competitor_premium: yes(),
    },
    {
      label_en: "Price",
      label_zh: "價格",
      runward: text("≈ US$6.15 / mo · ≈ US$62 / yr", "約 US$6.15 / 月 · 約 US$62 / 年"),
      competitor_free: text("Free", "免費"),
      competitor_premium: text("≈ US$11.99 / mo", "約 US$11.99 / 月"),
    },
  ],
};

export const comparisons: CompetitorComparison[] = [garminComparison, stravaComparison];
