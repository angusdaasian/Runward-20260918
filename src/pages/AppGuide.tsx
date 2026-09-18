import { ArrowLeft, BookOpen } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import HowToUseGuide from "@/components/HowToUseGuide";
import { Lang } from "@/lib/i18n";

const AppGuide = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [lang] = useState<Lang>(() => (localStorage.getItem("app_lang") as Lang) || "en");
  const fallbackRoute = ((location.state as { from?: string } | null)?.from) || "/";

  const handleReturn = () => {
    if ((window.history.state?.idx ?? 0) > 0) {
      navigate(-1);
      return;
    }
    navigate(fallbackRoute, { replace: true });
  };

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-background px-5 pb-10 pt-6 md:max-w-3xl md:px-10 md:pb-20 md:pt-12 lg:max-w-4xl">
      <Button
        variant="ghost"
        onClick={handleReturn}
        className="mb-6 -ml-3 text-muted-foreground md:mb-10"
      >
        <ArrowLeft size={16} />
        {lang === "zh" ? "返回" : "Back"}
      </Button>

      <div className="mb-6 flex items-center gap-3 md:mb-10">
        <BookOpen size={24} className="text-primary md:h-8 md:w-8" />
        <h1 className="font-display text-2xl font-bold text-foreground md:text-4xl">
          {lang === "zh" ? "使用教學" : "App Guide"}
        </h1>
      </div>

      <HowToUseGuide lang={lang} />
    </div>
  );
};

export default AppGuide;