import { useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2, RefreshCw, AlertTriangle, Footprints } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import {
  useUserShoes, useShoeDefaults, useShoeAssignments,
  shoeLabel, computeShoeKm, RUN_TYPES, RunTypeKey,
  ShoeCatalogItem, UserShoe,
} from "@/hooks/use-shoes";
import { useToast } from "@/hooks/use-toast";

type Props = { lang: Lang; onBack: () => void };

const RUN_TYPE_LABEL_EN: Record<RunTypeKey, string> = {
  Recovery: "Recovery", Easy: "Easy", Long: "Long", Tempo: "Tempo", Interval: "Interval", Race: "Race",
};
const RUN_TYPE_LABEL_ZH: Record<RunTypeKey, string> = {
  Recovery: "恢復跑", Easy: "輕鬆跑", Long: "長課", Tempo: "節奏跑", Interval: "間歇", Race: "比賽",
};

const CAT_LABEL_EN: Record<string, string> = {
  daily: "Daily", easy: "Easy", tempo: "Tempo", interval: "Interval", race: "Race", trail: "Trail", recovery: "Recovery",
};
const CAT_LABEL_ZH: Record<string, string> = {
  daily: "日常", easy: "輕鬆", tempo: "節奏", interval: "間歇", race: "比賽", trail: "越野", recovery: "恢復",
};

export default function ShoesPage({ lang, onBack }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { shoes, reload } = useUserShoes();
  const { defaults, setDefault } = useShoeDefaults();
  const { assignments } = useShoeAssignments();

  const [showAdd, setShowAdd] = useState(false);

  const t = (en: string, zh: string) => (lang === "zh" ? zh : en);
  const rtLabel = (rt: RunTypeKey) => (lang === "zh" ? RUN_TYPE_LABEL_ZH[rt] : RUN_TYPE_LABEL_EN[rt]);
  const catLabel = (c: string) => (lang === "zh" ? CAT_LABEL_ZH[c] || c : CAT_LABEL_EN[c] || c);

  const activeShoes = shoes.filter((s) => !s.retired);
  const retiredShoes = shoes.filter((s) => s.retired);

  const retireShoe = async (id: string, retired: boolean) => {
    await supabase.from("user_shoes").update({ retired }).eq("id", id);
    await reload();
  };
  const deleteShoe = async (id: string) => {
    if (!confirm(t("Delete this shoe? Mileage history will be removed.", "刪除此鞋款？相關里數紀錄將被移除。"))) return;
    await supabase.from("user_shoes").delete().eq("id", id);
    await reload();
  };

  const km = (s: UserShoe) => computeShoeKm(s.id, assignments);
  const pct = (s: UserShoe) => Math.min(100, Math.round((km(s) / (s.max_km || 1)) * 100));

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={onBack} className="p-1 -ml-1"><ArrowLeft size={22} /></button>
          <h1 className="text-lg font-semibold flex-1">{t("Shoes", "跑鞋")}</h1>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-medium"
          >
            <Plus size={16} /> {t("Add", "新增")}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* My shoes */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">{t("My Shoes", "我的跑鞋")}</h2>
          {activeShoes.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
              <Footprints className="mx-auto mb-2 text-muted-foreground" size={28} />
              {t("No shoes yet. Tap Add to build your rotation.", "尚未新增跑鞋。點擊「新增」建立你的鞋櫃。")}
            </div>
          ) : (
            <div className="space-y-2">
              {activeShoes.map((s) => {
                const kmVal = km(s);
                const p = pct(s);
                const warn = p >= 80 && p < 100;
                const over = p >= 100;
                return (
                  <div key={s.id} className="bg-card border border-border rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{shoeLabel(s)}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.catalog?.category ? catLabel(s.catalog.category) : t("Custom", "自訂")}
                          {s.catalog?.year ? ` · ${s.catalog.year}` : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-semibold ${over ? "text-destructive" : warn ? "text-orange-500" : ""}`}>
                          {kmVal.toFixed(1)} / {s.max_km} km
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${over ? "bg-destructive" : warn ? "bg-orange-500" : "bg-primary"}`}
                        style={{ width: `${p}%` }}
                      />
                    </div>
                    {over && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                        <AlertTriangle size={12} />
                        {t("Past recommended mileage — consider retiring.", "已超過建議里數 — 建議退役此鞋。")}
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <label className="text-muted-foreground">{t("Max km", "上限")}</label>
                      <input
                        type="number"
                        defaultValue={s.max_km}
                        min={100}
                        onBlur={async (e) => {
                          const v = Number(e.target.value);
                          if (v && v !== s.max_km) {
                            await supabase.from("user_shoes").update({ max_km: v }).eq("id", s.id);
                            await reload();
                          }
                        }}
                        className="w-20 bg-muted rounded px-2 py-1"
                      />
                      <button
                        onClick={() => retireShoe(s.id, true)}
                        className="ml-auto text-muted-foreground hover:text-foreground"
                      >
                        {t("Retire", "退役")}
                      </button>
                      <button onClick={() => deleteShoe(s.id)} className="text-destructive"><Trash2 size={14} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Defaults per run type */}
        {activeShoes.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground mb-2">
              {t("Default shoe per run type", "各訓練類型預設鞋款")}
            </h2>
            <div className="bg-card border border-border rounded-xl divide-y divide-border">
              {RUN_TYPES.map((rt) => (
                <div key={rt} className="flex items-center gap-2 px-3 py-2">
                  <div className="w-20 text-sm">{rtLabel(rt)}</div>
                  <select
                    value={defaults[rt] || ""}
                    onChange={(e) => setDefault(rt, e.target.value || null)}
                    className="flex-1 bg-muted rounded px-2 py-1.5 text-sm"
                  >
                    <option value="">{t("— none —", "— 無 —")}</option>
                    {activeShoes.map((s) => (
                      <option key={s.id} value={s.id}>{shoeLabel(s)}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {t(
                "New activities auto-tag the default shoe for its classified run type. You can override per activity.",
                "新活動會自動套用該類型的預設鞋款；你可在每項活動中修改。"
              )}
            </p>
          </section>
        )}

        {/* Retired */}
        {retiredShoes.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground mb-2">{t("Retired", "已退役")}</h2>
            <div className="space-y-2">
              {retiredShoes.map((s) => (
                <div key={s.id} className="bg-muted/40 border border-border rounded-xl p-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="font-medium truncate opacity-70">{shoeLabel(s)}</div>
                    <div className="text-xs text-muted-foreground">{km(s).toFixed(1)} km</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => retireShoe(s.id, false)} className="text-xs text-primary">{t("Unretire", "取消退役")}</button>
                    <button onClick={() => deleteShoe(s.id)} className="text-destructive"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {showAdd && (
        <AddShoeSheet
          lang={lang}
          onClose={() => setShowAdd(false)}
          onAdded={async () => { setShowAdd(false); await reload(); }}
        />
      )}
    </div>
  );
}

// ── Add shoe sheet ──
function AddShoeSheet({
  lang, onClose, onAdded,
}: { lang: Lang; onClose: () => void; onAdded: () => void }) {
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const { toast } = useToast();
  const t = (en: string, zh: string) => (lang === "zh" ? zh : en);

  const [tab, setTab] = useState<"catalog" | "custom">("catalog");
  const [brandFilter, setBrandFilter] = useState<string>("");
  const [catalog, setCatalog] = useState<ShoeCatalogItem[]>([]);
  const [loadingCat, setLoadingCat] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadCatalog = async () => {
    setLoadingCat(true);
    const { data } = await supabase
      .from("shoes_catalog")
      .select("id,brand,model,category,year,description")
      .eq("active", true)
      .order("brand")
      .order("model");
    setCatalog((data as any[]) || []);
    setLoadingCat(false);
  };
  useMemo(() => { void loadCatalog(); }, []);

  const brands = useMemo(() => {
    const set = new Set<string>();
    for (const c of catalog) if (c.brand) set.add(c.brand);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [catalog]);

  const filtered = useMemo(() => {
    if (!brandFilter) return catalog;
    return catalog.filter((c) => c.brand === brandFilter);
  }, [catalog, brandFilter]);

  const addFromCatalog = async (c: ShoeCatalogItem) => {
    if (!user?.id) return;
    await supabase.from("user_shoes").insert({ user_id: user.id, catalog_id: c.id });
    toast({ title: t("Shoe added", "已加入鞋櫃"), description: `${c.brand} ${c.model}` });
    onAdded();
  };

  const [customBrand, setCustomBrand] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [nickname, setNickname] = useState("");
  const [maxKm, setMaxKm] = useState(700);

  const addCustom = async () => {
    if (!user?.id || !customBrand.trim() || !customModel.trim()) return;
    await supabase.from("user_shoes").insert({
      user_id: user.id,
      custom_brand: customBrand.trim(),
      custom_model: customModel.trim(),
      nickname: nickname.trim() || null,
      max_km: maxKm,
    });
    toast({ title: t("Shoe added", "已加入鞋櫃") });
    onAdded();
  };

  const refreshCatalog = async () => {
    setRefreshing(true);
    try {
      const { error } = await supabase.functions.invoke("shoes-refresh-catalog", { body: {} });
      if (error) throw error;
      toast({ title: t("Catalog refreshed", "已更新目錄") });
      await loadCatalog();
    } catch (e: any) {
      toast({
        title: t("Refresh failed", "更新失敗"),
        description: e?.message || String(e),
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-background w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">{t("Add a shoe", "新增跑鞋")}</h3>
            <button onClick={onClose} className="text-muted-foreground">✕</button>
          </div>
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            <button
              onClick={() => setTab("catalog")}
              className={`flex-1 py-1.5 text-sm rounded-md ${tab === "catalog" ? "bg-background shadow" : ""}`}
            >{t("From catalog", "從目錄")}</button>
            <button
              onClick={() => setTab("custom")}
              className={`flex-1 py-1.5 text-sm rounded-md ${tab === "custom" ? "bg-background shadow" : ""}`}
            >{t("Custom", "自訂")}</button>
          </div>
        </div>

        {tab === "catalog" ? (
          <div className="flex-1 overflow-y-auto">
            <div className="p-3 flex gap-2 items-center border-b border-border sticky top-0 bg-background">
              <select
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                className="flex-1 bg-muted rounded px-2 py-1.5 text-sm"
              >
                <option value="">{t("All brands", "全部品牌")}</option>
                {brands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              {isAdmin && (
                <button
                  onClick={refreshCatalog}
                  disabled={refreshing}
                  title={t("Refresh catalog via AI (admin)", "透過 AI 更新目錄（管理員）")}
                  className="text-xs flex items-center gap-1 text-primary disabled:opacity-50"
                >
                  <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} /> {t("AI refresh", "AI 更新")}
                </button>
              )}
            </div>
            {loadingCat ? (
              <div className="p-6 text-center text-sm text-muted-foreground">{t("Loading…", "載入中…")}</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {t("No matches. Try AI refresh to fetch latest shoes.", "沒有結果。試試 AI 更新以取得最新鞋款。")}
              </div>
            ) : (
              <ul>
                {filtered.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => addFromCatalog(c)}
                      className="w-full text-left px-4 py-2.5 border-b border-border hover:bg-muted/60"
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="font-medium">{c.brand} {c.model}</span>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.category}</span>
                      </div>
                      {c.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{c.description}</div>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">{t("Brand", "品牌")}</label>
              <input value={customBrand} onChange={(e) => setCustomBrand(e.target.value)} className="w-full bg-muted rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("Model", "型號")}</label>
              <input value={customModel} onChange={(e) => setCustomModel(e.target.value)} className="w-full bg-muted rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("Nickname (optional)", "暱稱（可選）")}</label>
              <input value={nickname} onChange={(e) => setNickname(e.target.value)} className="w-full bg-muted rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("Mileage limit (km)", "里數上限（公里）")}</label>
              <input type="number" value={maxKm} onChange={(e) => setMaxKm(Number(e.target.value) || 700)} className="w-full bg-muted rounded px-3 py-2 text-sm" />
            </div>
            <button
              onClick={addCustom}
              disabled={!customBrand.trim() || !customModel.trim()}
              className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg font-medium disabled:opacity-50"
            >
              {t("Add shoe", "新增鞋款")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
