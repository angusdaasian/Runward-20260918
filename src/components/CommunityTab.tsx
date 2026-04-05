import { useState } from "react";
import { MessageCircle, Trophy, Lock, Camera, Send, ArrowLeft } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { useAuth } from "@/contexts/AuthContext";
import FadeIn from "@/components/ui/FadeIn";

interface Props {
  lang: Lang;
}

type Section = "menu" | "chat" | "public-leaderboard" | "private-leaderboard";

// ---------- Community Chat ----------
const CommunityChat = ({ lang, onBack }: { lang: Lang; onBack: () => void }) => {
  const { user } = useAuth();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="p-1">
          <ArrowLeft size={22} className="text-foreground" />
        </button>
        <h2 className="font-display text-lg font-bold text-foreground">
          {lang === "zh" ? "社群聊天" : "Community Chat"}
        </h2>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <MessageCircle size={28} className="text-primary" />
        </div>
        <h3 className="font-semibold text-foreground text-base mb-2">
          {lang === "zh" ? "社群聊天即將推出" : "Community Chat Coming Soon"}
        </h3>
        <p className="text-sm text-muted-foreground max-w-[260px]">
          {lang === "zh"
            ? "分享你的跑步照片、與其他跑者交流心得，敬請期待！"
            : "Share your running photos and chat with fellow runners. Stay tuned!"}
        </p>
      </div>
    </div>
  );
};

// ---------- Public Leaderboard ----------
const PublicLeaderboard = ({ lang, onBack }: { lang: Lang; onBack: () => void }) => {
  const [period, setPeriod] = useState<"weekly" | "monthly">("weekly");

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="p-1">
          <ArrowLeft size={22} className="text-foreground" />
        </button>
        <h2 className="font-display text-lg font-bold text-foreground">
          {lang === "zh" ? "排行榜" : "Leaderboard"}
        </h2>
      </div>

      {/* Period Toggle */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setPeriod("weekly")}
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
            period === "weekly"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {lang === "zh" ? "本週" : "This Week"}
        </button>
        <button
          onClick={() => setPeriod("monthly")}
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
            period === "monthly"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {lang === "zh" ? "本月" : "This Month"}
        </button>
      </div>

      {/* Leaderboard List — placeholder */}
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Trophy size={28} className="text-primary" />
        </div>
        <h3 className="font-semibold text-foreground text-base mb-2">
          {lang === "zh" ? "排行榜即將推出" : "Leaderboard Coming Soon"}
        </h3>
        <p className="text-sm text-muted-foreground max-w-[260px]">
          {lang === "zh"
            ? "每週和每月排行榜將根據社群跑者的活動數據自動生成。"
            : "Weekly and monthly leaderboards will be generated automatically from community activity data."}
        </p>
        <p className="text-xs text-muted-foreground mt-2 max-w-[260px]">
          {lang === "zh"
            ? "沒有活動記錄的用戶不會出現在排行榜上。"
            : "Users without activities in the period will not appear on the leaderboard."}
        </p>
      </div>
    </div>
  );
};

// ---------- Private Leaderboard ----------
const PrivateLeaderboard = ({ lang, onBack }: { lang: Lang; onBack: () => void }) => {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="p-1">
          <ArrowLeft size={22} className="text-foreground" />
        </button>
        <h2 className="font-display text-lg font-bold text-foreground">
          {lang === "zh" ? "私人排行榜" : "Private Leaderboard"}
        </h2>
      </div>

      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Lock size={28} className="text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-foreground text-base mb-2">
          {lang === "zh" ? "即將推出" : "Coming Soon"}
        </h3>
        <p className="text-sm text-muted-foreground max-w-[260px]">
          {lang === "zh"
            ? "建立私人排行榜，與朋友一較高下！此功能即將推出。"
            : "Create private leaderboards and compete with friends! This feature is coming soon."}
        </p>
      </div>
    </div>
  );
};

// ---------- Main ----------
const CommunityTab = ({ lang }: Props) => {
  const [section, setSection] = useState<Section>("menu");

  if (section === "chat") {
    return (
      <FadeIn className="px-5 pt-6 max-w-lg mx-auto pb-24">
        <CommunityChat lang={lang} onBack={() => setSection("menu")} />
      </FadeIn>
    );
  }

  if (section === "public-leaderboard") {
    return (
      <FadeIn className="px-5 pt-6 max-w-lg mx-auto pb-24">
        <PublicLeaderboard lang={lang} onBack={() => setSection("menu")} />
      </FadeIn>
    );
  }

  if (section === "private-leaderboard") {
    return (
      <FadeIn className="px-5 pt-6 max-w-lg mx-auto pb-24">
        <PrivateLeaderboard lang={lang} onBack={() => setSection("menu")} />
      </FadeIn>
    );
  }

  const menuItems = [
    {
      icon: MessageCircle,
      title: lang === "zh" ? "社群聊天" : "Community Chat",
      desc: lang === "zh" ? "分享照片、與跑友交流" : "Share photos & chat with runners",
      section: "chat" as Section,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      icon: Trophy,
      title: lang === "zh" ? "公開排行榜" : "Public Leaderboard",
      desc: lang === "zh" ? "每週和每月社群排名" : "Weekly & monthly community rankings",
      section: "public-leaderboard" as Section,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
    },
    {
      icon: Lock,
      title: lang === "zh" ? "私人排行榜" : "Private Leaderboard",
      desc: lang === "zh" ? "與好友比賽（即將推出）" : "Compete with friends (Coming soon)",
      section: "private-leaderboard" as Section,
      color: "text-muted-foreground",
      bgColor: "bg-muted",
    },
  ];

  return (
    <FadeIn className="px-5 pt-6 max-w-lg mx-auto pb-24">
      <h1 className="font-display text-2xl font-bold text-foreground mb-2">
        {lang === "zh" ? "社群" : "Community"}
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        {lang === "zh" ? "與跑友交流、比較成績" : "Connect with fellow runners & compare results"}
      </p>

      <div className="space-y-3">
        {menuItems.map((item) => (
          <button
            key={item.section}
            onClick={() => setSection(item.section)}
            className="w-full bg-card border border-border rounded-xl p-4 flex items-center gap-4 hover:border-primary/50 transition-colors text-left"
          >
            <div className={`w-12 h-12 rounded-xl ${item.bgColor} flex items-center justify-center`}>
              <item.icon size={22} className={item.color} />
            </div>
            <div className="flex-1">
              <span className="font-medium text-foreground block">{item.title}</span>
              <span className="text-xs text-muted-foreground">{item.desc}</span>
            </div>
          </button>
        ))}
      </div>
    </FadeIn>
  );
};

export default CommunityTab;
