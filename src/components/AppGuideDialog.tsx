import { Activity, Dumbbell, Trophy, Award, BarChart3, Sparkles, Camera, MessageCircle, Calendar, Heart, MapPin, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Lang } from "@/lib/i18n";

interface AppGuideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang: Lang;
}

const AppGuideDialog = ({ open, onOpenChange, lang }: AppGuideDialogProps) => {
  const tx = (en: string, zh: string) => (lang === "zh" ? zh : en);

  const sections = [
    {
      icon: Activity,
      title: tx("Activities", "活動"),
      desc: tx(
        "Auto-sync runs from Strava, Garmin, Apple Health & Terra. View detailed maps, splits, pace, heart rate and elevation for every activity.",
        "自動從 Strava、Garmin、Apple Health 和 Terra 同步跑步資料。查看每次活動的詳細地圖、分段、配速、心率和爬升。"
      ),
    },
    {
      icon: Sparkles,
      title: tx("AI Activity Analysis & Posters", "AI 活動分析與海報"),
      desc: tx(
        "Get AI-powered insights on each run and generate beautiful share posters to post on social media.",
        "獲取每次跑步的 AI 分析，並生成精美的分享海報發佈到社交媒體。"
      ),
    },
    {
      icon: Dumbbell,
      title: tx("Training Plans", "訓練計劃"),
      desc: tx(
        "Personalised training programs based on your goals, race targets and current fitness. Includes weekly plan reviews (premium).",
        "根據您的目標、比賽和當前體能量身定制的訓練計劃。包含每週計劃回顧（付費版）。"
      ),
    },
    {
      icon: Trophy,
      title: tx("Races", "賽事"),
      desc: tx(
        "Browse upcoming races, register your goal events, and verify completed races to earn rewards.",
        "瀏覽即將到來的賽事、登記目標賽事，並驗證已完成的比賽以獲得獎勵。"
      ),
    },
    {
      icon: Award,
      title: tx("Community & Ranks", "社群與排名"),
      desc: tx(
        "Earn XP from runs, climb tier ranks (Bronze → Diamond), claim territories on the map, and compete on leaderboards.",
        "從跑步中賺取 XP，攀登階級排名（青銅 → 鑽石），在地圖上佔領城市，並參與排行榜競爭。"
      ),
    },
    {
      icon: BarChart3,
      title: tx("Analytics & Race Predictor", "數據分析與賽事預測"),
      desc: tx(
        "Track training load, HRV & readiness, and predict race times. Free tier shows 5K predictions; premium unlocks all distances.",
        "追蹤訓練負荷、HRV 與準備度，並預測比賽時間。免費版顯示 5K 預測；付費版解鎖所有距離。"
      ),
    },
    {
      icon: Camera,
      title: tx("Posture Analysis", "姿勢分析"),
      desc: tx(
        "Upload a running video and get AI-powered form analysis. Free: 1 per day. Premium: unlimited.",
        "上傳跑步影片並獲得 AI 姿勢分析。免費：每天 1 次。付費：無限次。"
      ),
    },
    {
      icon: MessageCircle,
      title: tx("AI Running Coach", "AI 跑步教練"),
      desc: tx(
        "Chat 24/7 with an AI coach that knows your training history and can answer any running question (premium).",
        "全天候與了解您訓練歷史的 AI 教練聊天，回答任何跑步問題（付費版）。"
      ),
    },
    {
      icon: Heart,
      title: tx("Health Integrations", "健康整合"),
      desc: tx(
        "Connect Garmin, Apple Health, Strava, or Terra to sync sleep, HRV, stress and daily readiness data.",
        "連接 Garmin、Apple Health、Strava 或 Terra 以同步睡眠、HRV、壓力和每日準備度數據。"
      ),
    },
    {
      icon: Calendar,
      title: tx("Daily Check-In & Rewards", "每日簽到與獎勵"),
      desc: tx(
        "Check in daily, complete challenges, and redeem reward codes for in-app perks.",
        "每日簽到、完成挑戰，並兌換獎勵碼以獲得應用內福利。"
      ),
    },
    {
      icon: MapPin,
      title: tx("Territory Map", "領土地圖"),
      desc: tx(
        "Run in different cities to claim landmarks and unlock city badges across your region.",
        "在不同城市跑步以佔領地標，並解鎖該地區的城市徽章。"
      ),
    },
    {
      icon: Users,
      title: tx("Settings & Plans", "設定與方案"),
      desc: tx(
        "Manage profile, language, connected apps, and compare Free vs Premium features in Settings.",
        "管理個人資料、語言、連接的應用程式，並在設定中比較免費版與付費版功能。"
      ),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tx("App Guide", "應用程式指南")}</DialogTitle>
          <DialogDescription>
            {tx(
              "Everything this app can do for your running journey.",
              "這款應用為您的跑步旅程能做的一切。"
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 mt-2">
          {sections.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Icon size={18} className="text-primary" />
              </div>
              <div className="flex flex-col">
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AppGuideDialog;
