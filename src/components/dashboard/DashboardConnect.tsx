import { lazy, Suspense } from "react";
import { Plug } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { TabPageSkeleton } from "@/components/ui/PageSkeleton";
import DesktopPageHeader from "./DesktopPageHeader";

const ConnectApps = lazy(() => import("@/components/ConnectApps"));

interface Props {
  lang: Lang;
  onBack: () => void;
}

export default function DashboardConnect({ lang, onBack }: Props) {
  const zh = lang === "zh";
  return (
    <div>
      <DesktopPageHeader
        title={zh ? "連接應用" : "Connect apps"}
        subtitle={zh ? "整合 Garmin、Strava、Apple Health 等服務" : "Sync with Garmin, Strava, Apple Health, and more"}
        icon={<Plug className="h-5 w-5" />}
      />
      <div className="max-w-3xl">
        <Card className="p-0 overflow-hidden">
          <Suspense fallback={<TabPageSkeleton />}>
            <ConnectApps lang={lang} onBack={onBack} />
          </Suspense>
        </Card>
      </div>
    </div>
  );
}
