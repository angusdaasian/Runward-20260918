import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { CHANGELOG, CURRENT_VERSION } from "@/data/changelog";

const Changelog = () => {
  const zh = (localStorage.getItem("app_lang") || "zh") === "zh";
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} /> {zh ? "返回首頁" : "Back to home"}
        </Link>
        <h1 className="text-3xl font-bold mt-6">{zh ? "更新日誌" : "Changelog"}</h1>
        <p className="text-muted-foreground mt-2">
          {zh ? `目前版本 v${CURRENT_VERSION}` : `Current version v${CURRENT_VERSION}`}
        </p>
        <ol className="mt-10 space-y-8 border-l border-border pl-6">
          {CHANGELOG.map((e) => {
            const c = zh ? e.zh : e.en;
            return (
              <li key={e.version} className="relative">
                <span className={`absolute -left-[31px] top-1.5 h-3 w-3 rounded-full ${e.major ? "bg-primary" : "bg-muted-foreground/40"}`} />
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className={`text-sm font-semibold rounded-full px-2 py-0.5 ${e.major ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>v{e.version}</span>
                  <h2 className="text-lg font-semibold">{c.title}</h2>
                  <time className="text-xs text-muted-foreground">{e.date}</time>
                </div>
                <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                  {c.items.map((i) => <li key={i}>{i}</li>)}
                </ul>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
};

export default Changelog;
