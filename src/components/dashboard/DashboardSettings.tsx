import { lazy, Suspense } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { TabPageSkeleton } from "@/components/ui/PageSkeleton";
import DesktopPageHeader from "./DesktopPageHeader";

const MoreTab = lazy(() => import("@/components/MoreTab"));

interface Props {
  lang: Lang;
  setLang: (l: Lang) => void;
  onLoginRequest: () => void;
  onNavigateConnectApps: () => void;
}

export default function DashboardSettings({ lang, setLang, onLoginRequest, onNavigateConnectApps }: Props) {
  const zh = lang === "zh";
  return (
    <div>
      <DesktopPageHeader
        title={zh ? "設定" : "Settings"}
        subtitle={zh ? "個人資料、訂閱與偏好設定" : "Profile, subscription, and preferences"}
        icon={<SettingsIcon className="h-5 w-5" />}
      />
      <div className="max-w-3xl">
        <Card className="p-0 overflow-hidden">
          <Suspense fallback={<TabPageSkeleton />}>
            <MoreTab
              lang={lang}
              setLang={setLang}
              onLoginRequest={onLoginRequest}
              onNavigateConnectApps={onNavigateConnectApps}
            />
          </Suspense>
        </Card>
      </div>
    </div>
  );
}
