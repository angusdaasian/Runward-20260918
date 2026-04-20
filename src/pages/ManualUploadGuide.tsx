import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Lang, getLang } from "@/lib/i18n";
import step1 from "@/assets/garmin-step-1.png";
import step2 from "@/assets/garmin-step-2.png";
import step3 from "@/assets/garmin-step-3.png";
import step4 from "@/assets/garmin-step-4.png";
import step5a from "@/assets/garmin-step-5a.png";
import step5b from "@/assets/garmin-step-5b.png";
import step6 from "@/assets/garmin-step-6.png";

interface Step {
  title: { en: string; zh: string };
  body?: { en: string; zh: string };
  images: string[];
}

const garminSteps: Step[] = [
  {
    title: {
      en: "1. Open the activity and tap Share",
      zh: "1. 到活動按分享",
    },
    images: [step1],
  },
  {
    title: {
      en: "2. Tap Web Link",
      zh: "2. 按 Web Link",
    },
    images: [step2],
  },
  {
    title: {
      en: "3. Tap Copy",
      zh: "3. 按複製",
    },
    images: [step3],
  },
  {
    title: {
      en: "4. Paste the copied text into the app",
      zh: "4. 將複製的文字貼上 App",
    },
    body: {
      en: "You'll get a block of text like:\n\"Check out my track running activity on Garmin Connect. #beatyesterday https://connect.garmin.com/modern/activity/xxxxxxxxxx\"\n\nPaste it directly into the manual import field and tap Import Activity.",
      zh: "你應該會得到一堆文字，格式如下：\n「Check out my track running activity on Garmin Connect. #beatyesterday https://connect.garmin.com/modern/activity/xxxxxxxxxx」\n\n你可以直接將文字貼上 App 裏面，然後按「匯入活動」。",
    },
    images: [step4],
  },
  {
    title: {
      en: "5. Wait ~5–10 seconds for the import to finish",
      zh: "5. 等大概 5–10 秒，導入成功",
    },
    body: {
      en: "Note: this method does not currently support the GPS route map — sorry!",
      zh: "（這個方式暫時不支持跑步路徑，抱歉）",
    },
    images: [step5a, step5b],
  },
  {
    title: {
      en: "6. Run AI analysis on your imported data",
      zh: "6. 用我們的 AI 系統作為分析",
    },
    body: {
      en: "Once the activity is imported, you can run our AI training analysis on it for personalised feedback.",
      zh: "然後你可以對這些數據用我們的 AI 系統作為分析。",
    },
    images: [step6],
  },
];

const ManualUploadGuide = () => {
  const navigate = useNavigate();
  const lang: Lang = getLang();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-lg hover:bg-muted"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold">
            {lang === "zh" ? "如何手動匯入？" : "How to upload manually?"}
          </h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        <section>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              Garmin
            </span>
            <h2 className="text-base font-semibold">
              {lang === "zh" ? "從 Garmin Connect 匯入" : "Import from Garmin Connect"}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            {lang === "zh"
              ? "請先在 Garmin Connect 將活動隱私設定為「公開」，然後依下列步驟操作："
              : "Set the activity to Public in Garmin Connect first, then follow the steps below:"}
          </p>

          <ol className="space-y-8">
            {garminSteps.map((step, idx) => (
              <li key={idx} className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">
                  {step.title[lang]}
                </h3>
                {step.body && (
                  <p className="text-sm text-muted-foreground whitespace-pre-line">
                    {step.body[lang]}
                  </p>
                )}
                <div className={`grid gap-3 ${step.images.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                  {step.images.map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt={`Step ${idx + 1}${step.images.length > 1 ? ` (${i + 1})` : ""}`}
                      loading="lazy"
                      className="w-full rounded-xl border border-border bg-muted"
                    />
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t border-border pt-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              COROS
            </span>
            <h2 className="text-base font-semibold">
              {lang === "zh" ? "從 COROS 匯入" : "Import from COROS"}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {lang === "zh"
              ? "在 COROS App 將活動匯出為 .fit 檔案，然後在「手動匯入活動」分頁切換到 COROS，選擇檔案上傳即可。"
              : "Export your activity as a .fit file from the COROS app, then open the Manually Import Activity card, switch to the COROS tab, and select the file."}
          </p>
        </section>
      </main>
    </div>
  );
};

export default ManualUploadGuide;
