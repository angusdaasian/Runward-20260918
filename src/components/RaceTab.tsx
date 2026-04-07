import { useState, useEffect, useMemo } from "react";
import { Search, X, MapPin, Calendar, Filter, ChevronDown, ChevronUp, Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Lang } from "@/lib/i18n";
import FadeIn from "@/components/ui/FadeIn";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";

interface Race {
  id: string;
  name: string;
  race_date: string;
  city: string;
  country: string;
  category: string;
  website_url: string | null;
  description: string | null;
  registration_info: string | null;
  source: string | null;
}

interface GroupedRace {
  name: string;
  race_date: string;
  city: string;
  country: string;
  categories: string[];
  website_url: string | null;
  description: string | null;
  source: string | null;
}

interface Props {
  lang: Lang;
}

const CATEGORIES = ["All", "Full Marathon", "Half Marathon", "Ultramarathon", "10K", "5K", "3K", "1K", "Road Race"];
const MONTHS = [
  "All",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTHS_ZH = [
  "全部",
  "一月",
  "二月",
  "三月",
  "四月",
  "五月",
  "六月",
  "七月",
  "八月",
  "九月",
  "十月",
  "十一月",
  "十二月",
];

const CATEGORY_COLORS: Record<string, string> = {
  "Full Marathon": "bg-red-500",
  "Half Marathon": "bg-amber-500",
  Ultramarathon: "bg-orange-700",
  "10K": "bg-blue-500",
  "5K": "bg-green-500",
  "3K": "bg-teal-500",
  "1K": "bg-cyan-500",
  "Road Race": "bg-purple-500",
};

// Priority order for the "main" category color bar
const CATEGORY_PRIORITY = ["Full Marathon", "Half Marathon", "Ultramarathon", "10K", "5K", "3K", "1K", "Road Race"];

/* ── Helpers for cross-language race dedup & category merging ── */

const _ws = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();

const _loc = (v: string, t: "c" | "r") => {
  const n = _ws(v);
  if (/(maca[ou]|澳門|澳门)/i.test(n)) return "Macau";
  if (/(hong\s*kong|香港)/i.test(n)) return "Hong Kong";
  if (t === "r" && /(中國|中国|china)/i.test(n)) return "China";
  if (t === "r" && /(日本|japan)/i.test(n)) return "Japan";
  return n;
};

const _inferLoc = (r: Pick<Race, "name" | "city" | "country" | "website_url">) => {
  const raw = [r.name, r.city, r.country, r.website_url ?? ""].join(" ");
  if (/(maca[ou]|澳門|澳门|\/a\/mo-)/i.test(raw)) return { city: "Macau", country: "Macau" };
  if (/(hong\s*kong|香港)/i.test(raw)) return { city: _loc(r.city, "c") || "Hong Kong", country: "Hong Kong" };
  return { city: _loc(r.city, "c"), country: _loc(r.country, "r") };
};

const _canon = (v: string) => {
  let s = _ws(v).toLowerCase().normalize("NFKC");
  const reps: [RegExp, string][] = [
    [/standard\s*chartered|渣打|渣馬|渣马|\bschkm?\b|\bschk\b/gi, "standardchartered"],
    [/hong\s*kong|香港/gi, "hongkong"],
    [/maca[ou]|澳門|澳门/gi, "macau"],
    [/marathon|馬拉松|马拉松/gi, "marathon"],
    [/half\s*marathon|半馬|半马|\bhm\b/gi, "halfmarathon"],
    [/full\s*marathon|全馬|全马|\bfm\b/gi, "fullmarathon"],
    [/road\s*race|路跑/gi, "roadrace"],
    [/international|國際|国际/gi, "international"],
  ];
  s = s.replace(/\s*20\d{2}\s*/g, " ");
  for (const [p, r] of reps) s = s.replace(p, ` ${r} `);
  return s.replace(/[^a-z0-9]+/g, "");
};

const _host = (u: string | null) => {
  if (!u) return "";
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

const _identity = (r: Pick<Race, "name" | "city" | "country" | "website_url">) => {
  const loc = _inferLoc(r);
  let id = _canon(r.name);
  for (const t of [_canon(loc.city), _canon(loc.country)]) if (t) id = id.split(t).join("");
  id = id.replace(
    /(?:international|marathon|halfmarathon|fullmarathon|ultramarathon|roadrace|race|run|10k|5k|3k|1k)+/g,
    "",
  );
  return id || _host(r.website_url) || _canon(r.name);
};

const _parseDist = (text: string | null): string[] => {
  if (!text) return [];
  const n = _ws(text),
    cats = new Set<string>(),
    nums = new Set<number>();
  if (/全馬|\bFM\b|full marathon/i.test(n)) cats.add("Full Marathon");
  if (/半馬|\bHM\b|half marathon/i.test(n)) cats.add("Half Marathon");
  if (/ultra|超馬/i.test(n)) cats.add("Ultramarathon");
  for (const m of n.matchAll(/((?:\d+(?:\.\d+)?\s*[,，]\s*)+\d+(?:\.\d+)?)\s*K\b/gi))
    for (const v of m[1].split(/[,，]\s*/)) {
      const d = parseFloat(v.trim());
      if (!isNaN(d)) nums.add(d);
    }
  for (const m of n.matchAll(/(\d+(?:\.\d+)?)\s*(?:km|k)\b/gi)) {
    const d = parseFloat(m[1]);
    if (!isNaN(d)) nums.add(d);
  }
  for (const d of nums) {
    if (d >= 100) cats.add("Ultramarathon");
    else if (d >= 42) cats.add("Full Marathon");
    else if (d >= 21) cats.add("Half Marathon");
    else if (d === 10) cats.add("10K");
    else if (d === 5) cats.add("5K");
    else if (d === 3) cats.add("3K");
    else if (d === 1) cats.add("1K");
  }
  return CATEGORY_PRIORITY.filter((c) => cats.has(c));
};

const _mergeCats = (...vals: Array<string | null | undefined>) => {
  const cats = new Set<string>();
  for (const v of vals) {
    if (!v) continue;
    if (CATEGORY_PRIORITY.includes(v)) cats.add(v);
    for (const c of _parseDist(v)) cats.add(c);
  }
  if (cats.size > 1) cats.delete("Road Race");
  if (cats.size === 0) cats.add("Road Race");
  return CATEGORY_PRIORITY.filter((c) => cats.has(c));
};

const _isDistOnly = (t: string | null) => {
  if (!t) return false;
  return /^[\d\s,，./+\-KkMmHhFf全半馬马公里]+$/.test(_ws(t));
};

const RaceTabSkeleton = () => (
  <div className="px-5 pt-6 max-w-lg mx-auto space-y-4 animate-pulse">
    <Skeleton className="h-10 w-full rounded-xl" />
    <div className="flex gap-2">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-8 w-20 rounded-full" />
      ))}
    </div>
    <Skeleton className="h-40 w-full rounded-xl" />
    <Skeleton className="h-40 w-full rounded-xl" />
    <Skeleton className="h-40 w-full rounded-xl" />
  </div>
);

const RaceTab = ({ lang }: Props) => {
  const { user } = useAuth();
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [monthFilter, setMonthFilter] = useState("All");
  const [countryFilter, setCountryFilter] = useState("All");
  const [showFilters, setShowFilters] = useState(false);
  const [skeletonDone, setSkeletonDone] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", race_date: "", place: "", category: "Full Marathon" });
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ verified: boolean; reason: string } | null>(null);

  const [page, setPage] = useState(1);
  const perPage = 5;

  useEffect(() => {
    const timer = setTimeout(() => setSkeletonDone(true), 400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const fetchRaces = async () => {
      const { data } = await supabase
        .from("races")
        .select("*")
        .gte("race_date", new Date().toISOString().split("T")[0])
        .order("race_date", { ascending: true });
      setRaces((data as Race[]) || []);
      if (data && data.length > 0) {
        const latest = data.reduce((a: any, b: any) => (a.updated_at > b.updated_at ? a : b));
        setLastUpdated(latest.updated_at);
      }
      setLoading(false);
    };
    fetchRaces();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, GroupedRace>();
    for (const r of races) {
      const loc = _inferLoc(r);
      const key = `${r.race_date}__${_canon(loc.city)}__${_canon(loc.country)}__${_identity({ ...r, city: loc.city, country: loc.country })}`;
      const categories = _mergeCats(r.category, r.description);

      if (map.has(key)) {
        const existing = map.get(key)!;
        existing.categories = _mergeCats(...existing.categories, ...categories);
        if (r.name.length > existing.name.length && /[a-zA-Z]/.test(r.name)) {
          existing.name = r.name;
        }
        if (!existing.website_url && r.website_url) existing.website_url = r.website_url;
        if ((r.description?.length ?? 0) > (existing.description?.length ?? 0)) existing.description = r.description;
        existing.city = loc.city;
        existing.country = loc.country;
      } else {
        map.set(key, {
          name: r.name,
          race_date: r.race_date,
          city: loc.city,
          country: loc.country,
          categories,
          website_url: r.website_url,
          description: r.description,
          source: r.source,
        });
      }
    }
    return Array.from(map.values());
  }, [races]);

  const countries = useMemo(() => {
    const unique = [...new Set(grouped.map((r) => r.country))].sort();
    return ["All", ...unique];
  }, [grouped]);

  const filtered = useMemo(() => {
    return grouped.filter((r) => {
      if (category !== "All" && !r.categories.includes(category)) return false;
      if (monthFilter !== "All") {
        const monthIdx = MONTHS.indexOf(monthFilter);
        const raceMonth = new Date(r.race_date).getMonth() + 1;
        if (raceMonth !== monthIdx) return false;
      }
      if (countryFilter !== "All" && r.country !== countryFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.name.toLowerCase().includes(q) &&
          !r.city.toLowerCase().includes(q) &&
          !r.country.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [grouped, category, monthFilter, countryFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  useEffect(() => {
    setPage(1);
  }, [category, monthFilter, countryFilter, search]);

  if (loading || !skeletonDone) return <RaceTabSkeleton />;

  const monthLabels = lang === "zh" ? MONTHS_ZH : MONTHS;

  return (
    <FadeIn className="px-5 pt-6 max-w-lg mx-auto pb-24">
      <h1 className="font-display text-2xl font-bold text-foreground mb-1">
        {lang === "zh" ? "賽事日曆" : "Race Calendar"}
      </h1>
      <p className="text-sm text-muted-foreground mb-1">
        {lang === "zh" ? "探索即將舉行的跑步賽事" : "Discover upcoming running events"}
      </p>
      {lastUpdated && (
        <p className="text-[11px] text-muted-foreground/60 mb-4">
          {lang === "zh" ? "最後更新：" : "Last updated: "}
          {new Date(lastUpdated).toLocaleDateString(lang === "zh" ? "zh-HK" : "en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}
      {!lastUpdated && <div className="mb-4" />}

      {/* Search */}
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={lang === "zh" ? "搜尋賽事..." : "Search races..."}
          className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-border bg-card text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X size={16} className="text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Category Filter */}
      <div className="mb-3">
        <p className="text-xs font-medium text-muted-foreground mb-1.5">{lang === "zh" ? "賽事類別" : "Category"}</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                category === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {cat === "All" ? (lang === "zh" ? "全部" : "All") : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Toggle More Filters */}
      <button
        onClick={() => setShowFilters(!showFilters)}
        className="flex items-center gap-1.5 text-xs font-medium text-primary mb-3"
      >
        <Filter size={14} />
        {showFilters ? (lang === "zh" ? "隱藏篩選" : "Hide Filters") : lang === "zh" ? "更多篩選" : "More Filters"}
        {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {showFilters && (
        <div className="space-y-3 mb-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">{lang === "zh" ? "月份" : "Month"}</p>
            <div className="flex flex-wrap gap-1.5">
              {MONTHS.map((m, idx) => (
                <button
                  key={m}
                  onClick={() => setMonthFilter(m)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                    monthFilter === m
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {monthLabels[idx]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">
              {lang === "zh" ? "國家/地區" : "Country"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {countries.map((c) => (
                <button
                  key={c}
                  onClick={() => setCountryFilter(c)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                    countryFilter === c
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {c === "All" ? (lang === "zh" ? "全部" : "All") : c}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Results Count */}
      <p className="text-xs text-muted-foreground mb-3">
        {filtered.length} {lang === "zh" ? "場賽事" : "races found"}
      </p>

      {/* Race Cards */}
      <div className="space-y-3">
        {paged.length === 0 && (
          <div className="text-center py-12 space-y-4">
            <p className="text-sm text-muted-foreground">
              {lang === "zh" ? "找不到符合條件的賽事" : "No races found matching your filters"}
            </p>
            {user && (
              <button
                onClick={() => {
                  setShowAddForm(true);
                  setVerifyResult(null);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Plus size={14} />
                {lang === "zh" ? "新增賽事" : "Add a Race"}
              </button>
            )}
          </div>
        )}

        {/* Add Race Form */}
        {showAddForm && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3 mb-4">
            <h3 className="font-semibold text-sm text-foreground">{lang === "zh" ? "新增賽事" : "Add a Race"}</h3>
            <input
              type="text"
              placeholder={lang === "zh" ? "賽事名稱 *" : "Race Name *"}
              value={addForm.name}
              onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
            />
            <input
              type="date"
              value={addForm.race_date}
              onChange={(e) => setAddForm((f) => ({ ...f, race_date: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm appearance-none"
            />
            <input
              type="text"
              placeholder={lang === "zh" ? "地點 *（例：香港、東京）" : "Place * (e.g. Hong Kong, Tokyo)"}
              value={addForm.place}
              onChange={(e) => setAddForm((f) => ({ ...f, place: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm"
            />
            <div className="flex flex-wrap gap-2">
              {["5K", "10K", "Half Marathon", "Full Marathon"].map((c) => (
                <button
                  key={c}
                  onClick={() => setAddForm((f) => ({ ...f, category: c }))}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    addForm.category === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            {verifyResult && (
              <div className="p-3 rounded-lg text-sm bg-amber-500/10 text-amber-700 dark:text-amber-400">
                {lang === "zh"
                  ? "📋 賽事已提交審核，管理員確認後將會顯示。"
                  : "📋 Race submitted for admin review. It will appear once approved."}
                <p className="text-xs mt-1 opacity-80">{verifyResult.reason}</p>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (!addForm.name || !addForm.race_date || !addForm.place) return;
                  setVerifying(true);
                  setVerifyResult(null);
                  try {
                    const { data, error } = await supabase.functions.invoke("verify-race", {
                      body: {
                        name: addForm.name,
                        race_date: addForm.race_date,
                        place: addForm.place,
                        category: addForm.category,
                      },
                    });
                    if (error) throw error;
                    setVerifyResult(data);
                    if (user) {
                      await supabase.from("pending_races").insert({
                        name: addForm.name,
                        race_date: addForm.race_date,
                        city: data.city || addForm.place,
                        country: data.country || addForm.place,
                        category: addForm.category,
                        submitted_by: user.id,
                        ai_verification_result: JSON.stringify({
                          verified: data.verified,
                          reason: data.reason,
                          confidence: data.confidence,
                        }),
                      });
                    }
                  } catch (err) {
                    console.error("Verify failed:", err);
                    setVerifyResult({ verified: false, reason: "Verification service unavailable" });
                  } finally {
                    setVerifying(false);
                  }
                }}
                disabled={verifying || !addForm.name || !addForm.race_date || !addForm.place}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {verifying && <Loader2 size={14} className="animate-spin" />}
                {lang === "zh" ? "提交" : "Submit"}
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setVerifyResult(null);
                  setAddForm({ name: "", race_date: "", place: "", category: "Full Marathon" });
                }}
                className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                {lang === "zh" ? "取消" : "Cancel"}
              </button>
            </div>
          </div>
        )}

        {paged.map((race, idx) => {
          const raceDate = new Date(race.race_date);
          const dateStr = raceDate.toLocaleDateString(lang === "zh" ? "zh-HK" : "en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          });
          // Sort categories by priority for display
          const sortedCats = [...race.categories].sort(
            (a, b) => CATEGORY_PRIORITY.indexOf(a) - CATEGORY_PRIORITY.indexOf(b),
          );
          const mainCat = sortedCats[0];
          const catColor = CATEGORY_COLORS[mainCat] || "bg-muted-foreground";

          return (
            <div
              key={`${race.name}_${race.race_date}_${idx}`}
              className="bg-card border border-border rounded-xl overflow-hidden"
            >
              <div className={`${catColor} px-4 py-2.5`}>
                <h3 className="font-bold text-white text-sm uppercase tracking-wide">{race.name}</h3>
              </div>
              <div className="p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin size={13} />
                  <span>
                    {race.city}, {race.country}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar size={13} />
                  <span>{dateStr}</span>
                </div>
                {race.description && !_isDistOnly(race.description) && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{race.description}</p>
                )}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {sortedCats.map((cat) => (
                    <span
                      key={cat}
                      className={`${CATEGORY_COLORS[cat] || "bg-muted-foreground"} text-white text-[10px] font-semibold px-2 py-0.5 rounded-full`}
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-card text-foreground disabled:opacity-40"
          >
            {lang === "zh" ? "上一頁" : "Prev"}
          </button>
          <span className="text-xs text-muted-foreground">
            {lang === "zh" ? `第 ${page} / ${totalPages} 頁` : `Page ${page} of ${totalPages}`}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-card text-foreground disabled:opacity-40"
          >
            {lang === "zh" ? "下一頁" : "Next"}
          </button>
        </div>
      )}

      {/* Add race button */}
      {user && !showAddForm && paged.length > 0 && (
        <div className="flex justify-center mt-4">
          <button
            onClick={() => {
              setShowAddForm(true);
              setVerifyResult(null);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            <Plus size={14} />
            {lang === "zh" ? "新增賽事" : "Add a Race"}
          </button>
        </div>
      )}
    </FadeIn>
  );
};

export default RaceTab;
