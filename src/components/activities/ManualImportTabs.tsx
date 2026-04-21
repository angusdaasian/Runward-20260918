import { useState } from "react";
import { Upload, ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Lang } from "@/lib/i18n";
import ManualGarminImport from "./ManualGarminImport";
import CorosFitImport from "./CorosFitImport";

interface Props {
  lang: Lang;
  onImported: () => void;
}

type TabKey = "garmin" | "coros";

const ManualImportTabs = ({ lang, onImported }: Props) => {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<TabKey>("garmin");

  return (
    <div className="bg-card border border-border rounded-xl mb-4 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Upload size={18} className="text-primary" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">
              {lang === "zh" ? "手動匯入活動" : "Manually Import Activity"}
            </div>
            <div className="text-xs text-muted-foreground">
              {lang === "zh" ? "從 Garmin 或 COROS 匯入" : "Import from Garmin or COROS"}
            </div>
            <Link
              to="/manual-upload-guide"
              onClick={(e) => e.stopPropagation()}
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              aria-label={lang === "zh" ? "如何匯入？" : "How to upload?"}
            >
              <HelpCircle size={14} />
              <span>{lang === "zh" ? "如何匯入？" : "How to upload?"}</span>
            </Link>
          </div>
        </div>
        {expanded ? (
          <ChevronUp size={18} className="text-muted-foreground" />
        ) : (
          <ChevronDown size={18} className="text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border pt-3">
          <div className="flex gap-2 mb-3 bg-muted/40 p-1 rounded-lg">
            <button
              onClick={() => setTab("garmin")}
              className={`flex-1 text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
                tab === "garmin"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              Garmin
            </button>
            <button
              onClick={() => setTab("coros")}
              className={`flex-1 text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
                tab === "coros"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              COROS
            </button>
          </div>

          {tab === "garmin" ? (
            <ManualGarminImport lang={lang} onImported={onImported} embedded />
          ) : (
            <CorosFitImport lang={lang} onImported={onImported} embedded />
          )}
        </div>
      )}
    </div>
  );
};

export default ManualImportTabs;
