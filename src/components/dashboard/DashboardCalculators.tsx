import { Calculator, Beaker, Gauge, Sparkles } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import DesktopPageHeader from "./DesktopPageHeader";
import { RaceFuelCalculator } from "@/components/FuelingGuide";
import RacePredictorCard from "@/components/analytics/RacePredictorCard";
import DesktopPaceCalculator from "./DesktopPaceCalculator";

interface Props { lang: Lang; }

export default function DashboardCalculators({ lang }: Props) {
  const zh = lang === "zh";
  return (
    <div>
      <DesktopPageHeader
        title={zh ? "計算器" : "Calculators"}
        subtitle={zh ? "配速、補給與比賽預測工具" : "Pace, nutrition and race prediction tools"}
        icon={<Calculator className="h-5 w-5" />}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card className="p-6 xl:col-span-2">
          <SectionHeader
            icon={<Gauge className="h-4 w-4" />}
            title={zh ? "配速計算器" : "Pace Calculator"}
            desc={zh ? "在配速、時間與距離之間轉換,並產生分段表" : "Convert between pace, time and distance, plus generate split tables"}
          />
          <DesktopPaceCalculator lang={lang} />
        </Card>

        <Card className="p-6">
          <SectionHeader
            icon={<Beaker className="h-4 w-4" />}
            title={zh ? "比賽補給計算器" : "Race Nutrition Calculator"}
            desc={zh ? "半馬與全馬的能量膠補給規劃" : "Gel & carb planning for HM and FM"}
          />
          <RaceFuelCalculator isZh={zh} />
        </Card>

        <Card className="p-6">
          <SectionHeader
            icon={<Sparkles className="h-4 w-4" />}
            title={zh ? "比賽成績預測" : "Race Prediction"}
            desc={zh ? "根據近期表現與天氣預測比賽時間 (10K / 半馬 / 全馬 為高級功能)" : "Predicts race times from recent fitness & weather (10K / HM / FM are Premium)"}
          />
          <RacePredictorCard lang={lang} />
        </Card>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center">{icon}</div>
        <h3 className="font-display font-semibold text-lg">{title}</h3>
      </div>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </div>
  );
}
