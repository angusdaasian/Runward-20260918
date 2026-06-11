import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search, X, MapPin, Calendar as CalendarIcon, Plus, Loader2,
  BookmarkPlus, Trash2, Bookmark, Timer, Pencil, Check, WifiOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Lang } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { getCached, setCached, CacheKeys } from "@/lib/offlineCache";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

interface Race {
  id: string;
  name: string;
  name_zh: string | null;
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
  name_zh: string | null;
  race_date: string;
  city: string;
  country: string;
  categories: string[];
  website_url: string | null;
  description: string | null;
  source: string | null;
}

interface UserRaceRow {
  id: string;
  race_name: string;
  race_name_zh: string | null;
  race_date: string;
  city: string | null;
  country: string | null;
  category: string;
  source: string;
  website_url: string | null;
  notes: string | null;
  finish_time_seconds: number | null;
  finish_time_source: string | null;
  priority: "A" | "B" | "C" | "none";
}

const CATEGORIES = ["All", "Full Marathon", "Half Marathon", "Ultramarathon", "Trail Race", "10K", "5K", "3K", "1K", "Road Race"];
const MONTHS = ["All","January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_ZH = ["全部","一月","二月","三月","四月","五月","六月","七月","八月","九月","十月","十一月","十二月"];
const CATEGORY_COLORS: Record<string, string> = {
  "Full Marathon": "bg-red-500", "Half Marathon": "bg-amber-500",
  Ultramarathon: "bg-orange-700", "Trail Race": "bg-lime-600",
  "10K": "bg-blue-500", "5K": "bg-green-500", "3K": "bg-teal-500",
  "1K": "bg-cyan-500", "Road Race": "bg-purple-500",
};
const CATEGORY_PRIORITY = ["Full Marathon","Half Marathon","Ultramarathon","Trail Race","10K","5K","3K","1K","Road Race"];

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
const _host = (u: string | null) => { if (!u) return ""; try { return new URL(u).hostname.replace(/^www\./,""); } catch { return ""; } };
const _identity = (r: Pick<Race, "name" | "city" | "country" | "website_url">) => {
  const loc = _inferLoc(r);
  let id = _canon(r.name);
  for (const t of [_canon(loc.city), _canon(loc.country)]) if (t) id = id.split(t).join("");
  id = id.replace(/(?:international|marathon|halfmarathon|fullmarathon|ultramarathon|roadrace|race|run|10k|5k|3k|1k)+/g, "");
  return id || _host(r.website_url) || _canon(r.name);
};
const _parseDist = (text: string | null): string[] => {
  if (!text) return [];
  const n = _ws(text), cats = new Set<string>(), nums = new Set<number>();
  if (/全馬|\bFM\b|full marathon/i.test(n)) cats.add("Full Marathon");
  if (/半馬|\bHM\b|half marathon/i.test(n)) cats.add("Half Marathon");
  if (/ultra|超馬/i.test(n)) cats.add("Ultramarathon");
  for (const m of n.matchAll(/((?:\d+(?:\.\d+)?\s*[,，]\s*)+\d+(?:\.\d+)?)\s*K\b/gi))
    for (const v of m[1].split(/[,，]\s*/)) { const d = parseFloat(v.trim()); if (!isNaN(d)) nums.add(d); }
  for (const m of n.matchAll(/(\d+(?:\.\d+)?)\s*(?:km|k)\b/gi)) { const d = parseFloat(m[1]); if (!isNaN(d)) nums.add(d); }
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
const _isDistOnly = (t: string | null) => { if (!t) return false; return /^[\d\s,，./+\-KkMmHhFf全半馬马公里]+$/.test(_ws(t)); };

const fmtFinishTime = (totalSeconds: number) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  return `${h.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")}:${s.toString().padStart(2,"0")}`;
};
const parseHmsToSeconds = (h: string, m: string, s: string): number | null => {
  const hh = parseInt(h || "0", 10), mm = parseInt(m || "0", 10), ss = parseInt(s || "0", 10);
  if (Number.isNaN(hh) || Number.isNaN(mm) || Number.isNaN(ss)) return null;
  if (mm >= 60 || ss >= 60 || hh < 0 || mm < 0 || ss < 0) return null;
  const total = hh * 3600 + mm * 60 + ss;
  return total > 0 ? total : null;
};

interface Props { lang: Lang; }

export default function DesktopRaceTab({ lang }: Props) {
  const zh = lang === "zh";
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { online } = useOnlineStatus();

  const [activeTab, setActiveTab] = useState<"calendar" | "my">("calendar");
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [monthFilter, setMonthFilter] = useState("All");
  const [countryFilter, setCountryFilter] = useState("All");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [servedFromCache, setServedFromCache] = useState(false);

  const [myRaces, setMyRaces] = useState<UserRaceRow[]>([]);
  const [myRacesLoading, setMyRacesLoading] = useState(true);
  const [myAddOpen, setMyAddOpen] = useState(false);
  const [myAddForm, setMyAddForm] = useState({ name: "", race_date: "", city: "", country: "", category: "Full Marathon", distance_km: "", elevation_m: "" });
  const [savingMy, setSavingMy] = useState(false);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());

  const [page, setPage] = useState(1);
  const perPage = 12;

  useEffect(() => {
    const cached = getCached<{ races: Race[]; lastUpdated: string | null }>(CacheKeys.races());
    if (cached) {
      const today = new Date().toISOString().split("T")[0];
      const upcoming = cached.value.races.filter((r) => r.race_date >= today);
      setRaces(upcoming); setLastUpdated(cached.value.lastUpdated);
      setServedFromCache(true); setLoading(false);
    }
    if (!online) { if (!cached) setLoading(false); return; }
    (async () => {
      try {
        const { data } = await supabase.from("races").select("*")
          .gte("race_date", new Date().toISOString().split("T")[0])
          .order("race_date", { ascending: true });
        const list = (data as unknown as Race[]) || [];
        setRaces(list);
        let latestUpdated: string | null = null;
        if (data && data.length > 0) {
          const latest = data.reduce((a: any, b: any) => (a.updated_at > b.updated_at ? a : b));
          latestUpdated = latest.updated_at; setLastUpdated(latestUpdated);
        }
        setServedFromCache(false);
        setCached(CacheKeys.races(), { races: list, lastUpdated: latestUpdated });
      } catch {} finally { setLoading(false); }
    })();
  }, [online]);

  const loadMyRaces = useCallback(async () => {
    if (!user) { setMyRaces([]); setMyRacesLoading(false); setSavedKeys(new Set()); return; }
    setMyRacesLoading(true);
    const { data } = await supabase.from("user_races").select("*").eq("user_id", user.id).order("race_date", { ascending: true });
    const list = (data as any[] as UserRaceRow[]) || [];
    setMyRaces(list);
    const keys = new Set<string>();
    for (const r of list) keys.add(`${_canon(r.race_name)}__${r.race_date}`);
    setSavedKeys(keys); setMyRacesLoading(false);
  }, [user]);

  useEffect(() => { loadMyRaces(); }, [loadMyRaces]);

  const importRace = async (g: GroupedRace) => {
    if (!user) { toast({ title: zh ? "請先登入" : "Please sign in", variant: "destructive" }); return; }
    const key = `${_canon(g.name)}__${g.race_date}`;
    if (savedKeys.has(key)) { toast({ title: zh ? "已加入我的賽事" : "Already in My Races" }); return; }
    const mainCat = g.categories.sort((a, b) => CATEGORY_PRIORITY.indexOf(a) - CATEGORY_PRIORITY.indexOf(b))[0] || "Road Race";
    const { error } = await supabase.from("user_races").insert({
      user_id: user.id, race_name: g.name, race_name_zh: g.name_zh, race_date: g.race_date,
      city: g.city, country: g.country, category: mainCat, website_url: g.website_url, source: "imported",
    });
    if (error) { toast({ title: zh ? "無法新增" : "Failed to add", description: error.message, variant: "destructive" }); return; }
    toast({ title: zh ? "已加入我的賽事" : "Added to My Races" });
    setSavedKeys((s) => new Set(s).add(key));
    await loadMyRaces();
    queryClient.invalidateQueries({ queryKey: ["user-races", user.id] });
  };

  const removeMyRace = async (id: string) => {
    if (!user) return;
    const { error } = await supabase.from("user_races").delete().eq("id", id).eq("user_id", user.id);
    if (error) { toast({ title: zh ? "刪除失敗" : "Delete failed", variant: "destructive" }); return; }
    toast({ title: zh ? "已刪除" : "Removed" });
    await loadMyRaces();
    queryClient.invalidateQueries({ queryKey: ["user-races", user.id] });
  };

  const addManualMyRace = async () => {
    if (!user) return;
    if (!myAddForm.name || !myAddForm.race_date) {
      toast({ title: zh ? "請填寫名稱及日期" : "Please fill name and date", variant: "destructive" }); return;
    }
    setSavingMy(true);
    const needsTrailFields = myAddForm.category === "Ultramarathon" || myAddForm.category === "Trail Race";
    const distNum = parseFloat(myAddForm.distance_km);
    const eleNum = parseFloat(myAddForm.elevation_m);
    if (needsTrailFields && (!isFinite(distNum) || distNum <= 0)) {
      setSavingMy(false);
      toast({ title: zh ? "請輸入距離 (km)" : "Please enter distance (km)", variant: "destructive" }); return;
    }
    const { error } = await supabase.from("user_races").insert({
      user_id: user.id, race_name: myAddForm.name, race_date: myAddForm.race_date,
      city: myAddForm.city || null, country: myAddForm.country || null,
      category: myAddForm.category, source: "manual",
      ...(needsTrailFields ? { distance_km: distNum, elevation_m: isFinite(eleNum) ? eleNum : null } : {}),
    } as any);
    setSavingMy(false);
    if (error) { toast({ title: zh ? "新增失敗" : "Add failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: zh ? "已新增到我的賽事" : "Added to My Races" });
    setMyAddOpen(false);
    setMyAddForm({ name: "", race_date: "", city: "", country: "", category: "Full Marathon", distance_km: "", elevation_m: "" });
    await loadMyRaces();
    queryClient.invalidateQueries({ queryKey: ["user-races", user.id] });
  };

  const updateFinishTime = async (id: string, seconds: number | null) => {
    if (!user) return;
    const { error } = await supabase.from("user_races").update({
      finish_time_seconds: seconds, finish_time_source: seconds ? "manual" : null,
    } as any).eq("id", id).eq("user_id", user.id);
    if (error) { toast({ title: zh ? "更新失敗" : "Update failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: seconds ? (zh ? "已更新成績" : "Finish time updated") : (zh ? "已清除成績" : "Finish time cleared") });
    await loadMyRaces();
    queryClient.invalidateQueries({ queryKey: ["user-races", user.id] });
  };

  const updatePriority = async (id: string, priority: "A" | "B" | "C" | "none") => {
    if (!user) return;
    setMyRaces((prev) => prev.map((r) => (r.id === id ? { ...r, priority } : r)));
    const { error } = await supabase.from("user_races").update({ priority } as any).eq("id", id).eq("user_id", user.id);
    if (error) { toast({ title: zh ? "更新失敗" : "Update failed", description: error.message, variant: "destructive" }); await loadMyRaces(); return; }
    queryClient.invalidateQueries({ queryKey: ["user-races", user.id] });
  };

  const grouped = useMemo(() => {
    const map = new Map<string, GroupedRace>();
    for (const r of races) {
      const loc = _inferLoc(r);
      const key = `${r.race_date}__${_canon(loc.city)}__${_canon(loc.country)}__${_identity({ ...r, city: loc.city, country: loc.country })}`;
      const categories = _mergeCats(r.category, r.description);
      if (map.has(key)) {
        const existing = map.get(key)!;
        existing.categories = _mergeCats(...existing.categories, ...categories);
        if (r.name.length > existing.name.length && /[a-zA-Z]/.test(r.name)) existing.name = r.name;
        if (!existing.name_zh && (r as any).name_zh) existing.name_zh = (r as any).name_zh;
        if (!existing.website_url && r.website_url) existing.website_url = r.website_url;
        if ((r.description?.length ?? 0) > (existing.description?.length ?? 0)) existing.description = r.description;
        existing.city = loc.city; existing.country = loc.country;
      } else {
        map.set(key, {
          name: r.name, name_zh: (r as any).name_zh || null, race_date: r.race_date,
          city: loc.city, country: loc.country, categories,
          website_url: r.website_url, description: r.description, source: r.source,
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
        if (new Date(r.race_date).getMonth() + 1 !== monthIdx) return false;
      }
      if (countryFilter !== "All" && r.country !== countryFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!r.name.toLowerCase().includes(q) && !(r.name_zh || "").toLowerCase().includes(q)
            && !r.city.toLowerCase().includes(q) && !r.country.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [grouped, category, monthFilter, countryFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = filtered.slice((page - 1) * perPage, page * perPage);
  useEffect(() => { setPage(1); }, [category, monthFilter, countryFilter, search]);

  const monthLabels = zh ? MONTHS_ZH : MONTHS;

  return (
    <div className="p-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "calendar" | "my")}>
        <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
          <TabsTrigger value="calendar">{zh ? "賽事日曆" : "Race Calendar"}</TabsTrigger>
          <TabsTrigger value="my">
            {zh ? "我的賽事" : "My Races"}
            {myRaces.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold">
                {myRaces.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* === RACE CALENDAR === */}
        <TabsContent value="calendar" className="mt-0">
          {(!online || servedFromCache) && (
            <div className="flex items-center gap-1.5 mb-3 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md w-fit">
              <WifiOff size={12} />
              {zh ? "離線中 — 顯示已儲存的賽事" : "Offline — showing saved races"}
            </div>
          )}

          {/* Filter bar */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_200px_200px_200px] gap-3 mb-5">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={zh ? "搜尋賽事、城市、國家..." : "Search races, cities, countries..."}
                className="pl-9 pr-9"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X size={16} className="text-muted-foreground" />
                </button>
              )}
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c === "All" ? (zh ? "全部類別" : "All categories") : c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={m}>{i === 0 ? (zh ? "全部月份" : "All months") : monthLabels[i]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={countryFilter} onValueChange={setCountryFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {countries.map((c) => (
                  <SelectItem key={c} value={c}>{c === "All" ? (zh ? "全部地區" : "All countries") : c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-muted-foreground">
              {filtered.length} {zh ? "場賽事" : "races found"}
              {lastUpdated && ` · ${zh ? "更新於 " : "Updated "}${new Date(lastUpdated).toLocaleDateString(zh ? "zh-HK" : "en-US")}`}
            </p>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[1,2,3,4,5,6].map((i) => <Skeleton key={i} className="h-44 w-full rounded-xl" />)}
            </div>
          ) : paged.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground border border-dashed rounded-xl">
              {zh ? "找不到符合條件的賽事" : "No races found matching your filters"}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {paged.map((race, idx) => {
                const raceDate = new Date(race.race_date);
                const dateStr = raceDate.toLocaleDateString(zh ? "zh-HK" : "en-US", {
                  weekday: "short", year: "numeric", month: "short", day: "numeric",
                });
                const sortedCats = [...race.categories].sort((a, b) => CATEGORY_PRIORITY.indexOf(a) - CATEGORY_PRIORITY.indexOf(b));
                const mainCat = sortedCats[0];
                const catColor = CATEGORY_COLORS[mainCat] || "bg-muted-foreground";
                const savedKey = `${_canon(race.name)}__${race.race_date}`;
                const isSaved = savedKeys.has(savedKey);
                return (
                  <Card key={`${race.name}_${race.race_date}_${idx}`} className="overflow-hidden flex flex-col">
                    <div className={`${catColor} px-4 py-2.5`}>
                      <h3 className="font-bold text-white text-sm uppercase tracking-wide line-clamp-1">
                        {zh && race.name_zh ? race.name_zh : race.name}
                      </h3>
                    </div>
                    <div className="p-4 flex-1 flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <MapPin size={13} /><span>{race.city}, {race.country}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CalendarIcon size={13} /><span>{dateStr}</span>
                      </div>
                      {race.description && !_isDistOnly(race.description) && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{race.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {sortedCats.map((cat) => (
                          <span key={cat} className={`${CATEGORY_COLORS[cat] || "bg-muted-foreground"} text-white text-[10px] font-semibold px-2 py-0.5 rounded-full`}>
                            {cat}
                          </span>
                        ))}
                      </div>
                      {user && (
                        <Button
                          size="sm" variant={isSaved ? "secondary" : "default"}
                          onClick={() => importRace(race)} disabled={isSaved}
                          className="mt-auto self-start"
                        >
                          {isSaved ? <Bookmark size={14} className="mr-1.5" /> : <BookmarkPlus size={14} className="mr-1.5" />}
                          {isSaved ? (zh ? "已加入" : "Saved") : (zh ? "加入我的賽事" : "Add to My Races")}
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                {zh ? "上一頁" : "Previous"}
              </Button>
              <span className="text-xs text-muted-foreground">
                {zh ? `第 ${page} / ${totalPages} 頁` : `Page ${page} of ${totalPages}`}
              </span>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                {zh ? "下一頁" : "Next"}
              </Button>
            </div>
          )}
        </TabsContent>

        {/* === MY RACES === */}
        <TabsContent value="my" className="mt-0">
          {!user ? (
            <div className="text-center py-16 text-sm text-muted-foreground">
              {zh ? "請先登入以管理你的賽事" : "Please sign in to manage your races"}
            </div>
          ) : myRacesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          ) : (
            <MyRacesView
              zh={zh} lang={lang} myRaces={myRaces}
              onAdd={() => setMyAddOpen(true)} onRemove={removeMyRace}
              onSaveTime={updateFinishTime} onSetPriority={updatePriority}
              switchToCalendar={() => setActiveTab("calendar")}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Add race dialog */}
      <Dialog open={myAddOpen} onOpenChange={setMyAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{zh ? "新增賽事到我的賽事" : "Add to My Races"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{zh ? "賽事名稱 *" : "Race Name *"}</Label>
              <Input value={myAddForm.name} onChange={(e) => setMyAddForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{zh ? "日期 *" : "Date *"}</Label>
              <Input type="date" value={myAddForm.race_date} onChange={(e) => setMyAddForm((f) => ({ ...f, race_date: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{zh ? "城市" : "City"}</Label>
                <Input value={myAddForm.city} onChange={(e) => setMyAddForm((f) => ({ ...f, city: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{zh ? "國家/地區" : "Country"}</Label>
                <Input value={myAddForm.country} onChange={(e) => setMyAddForm((f) => ({ ...f, country: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{zh ? "類別" : "Category"}</Label>
              <Select value={myAddForm.category} onValueChange={(v) => setMyAddForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["5K","10K","Half Marathon","Full Marathon","Ultramarathon","Trail Race","Road Race"].map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(myAddForm.category === "Ultramarathon" || myAddForm.category === "Trail Race") && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{zh ? "距離 (公里) *" : "Distance (km) *"}</Label>
                  <Input type="number" min="0" step="0.1" value={myAddForm.distance_km}
                    onChange={(e) => setMyAddForm((f) => ({ ...f, distance_km: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>{zh ? "爬升 (米)" : "Elevation (m)"}</Label>
                  <Input type="number" min="0" step="10" value={myAddForm.elevation_m}
                    onChange={(e) => setMyAddForm((f) => ({ ...f, elevation_m: e.target.value }))} />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMyAddOpen(false)}>{zh ? "取消" : "Cancel"}</Button>
            <Button onClick={addManualMyRace} disabled={savingMy || !myAddForm.name || !myAddForm.race_date}>
              {savingMy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              {zh ? "儲存" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ───── My Races view ───── */
function MyRacesView({
  zh, lang, myRaces, onAdd, onRemove, onSaveTime, onSetPriority, switchToCalendar,
}: {
  zh: boolean; lang: Lang; myRaces: UserRaceRow[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onSaveTime: (id: string, seconds: number | null) => Promise<void> | void;
  onSetPriority: (id: string, p: "A" | "B" | "C" | "none") => Promise<void> | void;
  switchToCalendar: () => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const upcoming = myRaces.filter((r) => r.race_date >= today);
  const past = myRaces.filter((r) => r.race_date < today);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {zh ? `${upcoming.length} 場即將舉行 · ${past.length} 場已完成` : `${upcoming.length} upcoming · ${past.length} past`}
        </p>
        <Button onClick={onAdd} size="sm"><Plus size={14} className="mr-1.5" />{zh ? "新增賽事" : "Add Race"}</Button>
      </div>

      <Card className="p-4 bg-muted/30">
        <p className="text-xs font-semibold uppercase tracking-wide mb-2">{zh ? "賽事優先級" : "Race Priority"}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500/15 text-red-500 text-[10px] font-bold shrink-0">A</span>
            <span>{zh ? "最重要的目標賽事 — AI 教練會圍繞它規劃高峰期。" : "Top priority goal race — AI coach peaks training for this."}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/15 text-amber-500 text-[10px] font-bold shrink-0">B</span>
            <span>{zh ? "次要目標 — 視為 A 賽前的熱身賽。" : "Secondary goal — tune-up race before your A-goal."}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-500 text-[10px] font-bold shrink-0">C</span>
            <span>{zh ? "低優先級 — 當作訓練跑。" : "Low priority — run as a training session."}</span>
          </div>
        </div>
      </Card>

      {myRaces.length === 0 && (
        <Card className="p-10 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            {zh ? "尚未加入任何賽事。從賽事日曆匯入或手動新增。" : "No races yet. Import from the Race Calendar or add one manually."}
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={switchToCalendar}>
              {zh ? "瀏覽賽事日曆" : "Browse Race Calendar"}
            </Button>
            <Button size="sm" onClick={onAdd}><Plus size={14} className="mr-1.5" />{zh ? "手動新增" : "Add Manually"}</Button>
          </div>
        </Card>
      )}

      {upcoming.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{zh ? "即將舉行" : "Upcoming"}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcoming.map((r) => (
              <DesktopMyRaceCard key={r.id} race={r} lang={lang}
                onRemove={() => onRemove(r.id)}
                onSaveTime={(s) => onSaveTime(r.id, s)}
                onSetPriority={(p) => onSetPriority(r.id, p)} />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{zh ? "已完成" : "Past"}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {past.map((r) => (
              <DesktopMyRaceCard key={r.id} race={r} lang={lang} dim
                onRemove={() => onRemove(r.id)}
                onSaveTime={(s) => onSaveTime(r.id, s)}
                onSetPriority={(p) => onSetPriority(r.id, p)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ───── My Race Card (desktop) ───── */
function DesktopMyRaceCard({
  race, lang, onRemove, onSaveTime, onSetPriority, dim = false,
}: {
  race: UserRaceRow; lang: Lang;
  onRemove: () => void;
  onSaveTime: (seconds: number | null) => void | Promise<void>;
  onSetPriority: (p: "A" | "B" | "C" | "none") => void | Promise<void>;
  dim?: boolean;
}) {
  const zh = lang === "zh";
  const raceDate = new Date(race.race_date + "T00:00:00");
  const dateStr = raceDate.toLocaleDateString(zh ? "zh-HK" : "en-US", {
    weekday: "short", year: "numeric", month: "short", day: "numeric",
  });
  const today = new Date(); today.setHours(0,0,0,0);
  const daysAway = Math.round((raceDate.getTime() - today.getTime()) / 86400000);
  const catColor = CATEGORY_COLORS[race.category] || "bg-muted-foreground";
  const isPastOrToday = daysAway <= 0;
  const hasFinish = !!(race.finish_time_seconds && race.finish_time_seconds > 0);

  const initial = hasFinish ? {
    h: Math.floor(race.finish_time_seconds! / 3600).toString(),
    m: Math.floor((race.finish_time_seconds! % 3600) / 60).toString().padStart(2,"0"),
    s: Math.round(race.finish_time_seconds! % 60).toString().padStart(2,"0"),
  } : { h: "", m: "", s: "" };

  const [editing, setEditing] = useState(false);
  const [hh, setHh] = useState(initial.h);
  const [mm, setMm] = useState(initial.m);
  const [ss, setSs] = useState(initial.s);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setHh(initial.h); setMm(initial.m); setSs(initial.s); /* eslint-disable-next-line */ }, [race.finish_time_seconds]);

  const handleSave = async () => {
    const total = parseHmsToSeconds(hh, mm, ss);
    if (total === null) { toast({ title: zh ? "請輸入有效時間" : "Enter a valid time", variant: "destructive" }); return; }
    setSaving(true); await onSaveTime(total); setSaving(false); setEditing(false);
  };
  const handleClear = async () => { setSaving(true); await onSaveTime(null); setSaving(false); setEditing(false); };

  const PRIORITY_META: Record<"A"|"B"|"C"|"none", { cls: string }> = {
    A: { cls: "bg-red-500 text-white border-red-500" },
    B: { cls: "bg-amber-500 text-white border-amber-500" },
    C: { cls: "bg-emerald-500 text-white border-emerald-500" },
    none: { cls: "bg-muted text-muted-foreground border-border" },
  };

  return (
    <Card className={`overflow-hidden ${dim ? "opacity-70" : ""}`}>
      <div className={`${catColor} px-4 py-2 flex items-center justify-between`}>
        <span className="text-xs font-bold text-white uppercase tracking-wide">{race.category}</span>
        <div className="flex items-center gap-2">
          {race.priority && race.priority !== "none" && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${PRIORITY_META[race.priority].cls} border`}>
              {race.priority}-{zh ? "目標" : "Goal"}
            </span>
          )}
          <span className="text-[10px] font-medium text-white/90 uppercase">
            {race.source === "manual" ? (zh ? "手動" : "Manual") : (zh ? "已匯入" : "Imported")}
          </span>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-base flex-1">
            {zh && race.race_name_zh ? race.race_name_zh : race.race_name}
          </h3>
          <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Remove" className="h-8 w-8 text-muted-foreground hover:text-destructive">
            <Trash2 size={15} />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><CalendarIcon size={13} />{dateStr}</span>
          {(race.city || race.country) && (
            <span className="inline-flex items-center gap-1.5"><MapPin size={13} />{[race.city, race.country].filter(Boolean).join(", ")}</span>
          )}
          {daysAway > 0 && (
            <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              {zh ? `還有 ${daysAway} 天` : `${daysAway} days to go`}
            </span>
          )}
          {daysAway === 0 && (
            <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
              {zh ? "今天" : "Today"}
            </span>
          )}
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mr-1">{zh ? "目標" : "Goal"}</span>
          {(["A","B","C","none"] as const).map((p) => {
            const active = (race.priority || "none") === p;
            return (
              <button key={p} onClick={() => onSetPriority(p)}
                className={`text-[11px] font-bold px-2.5 py-1 rounded border transition ${
                  active ? PRIORITY_META[p].cls : "bg-transparent text-muted-foreground border-border hover:bg-muted"
                }`}>
                {p === "none" ? (zh ? "無" : "None") : p}
              </button>
            );
          })}
        </div>

        {(isPastOrToday || hasFinish) && (
          <div className="pt-3 border-t border-border/60">
            {!editing ? (
              <div className="flex items-center gap-2">
                <Timer size={14} className="text-muted-foreground" />
                {hasFinish ? (
                  <>
                    <span className="text-sm font-mono font-semibold">{fmtFinishTime(race.finish_time_seconds!)}</span>
                    {race.finish_time_source === "auto" && (
                      <span className="text-[9px] uppercase tracking-wide font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                        {zh ? "自動" : "Auto"}
                      </span>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="ml-auto h-7 text-xs">
                      <Pencil size={12} className="mr-1" />{zh ? "編輯" : "Edit"}
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="ml-auto h-7 text-xs">
                    <Plus size={12} className="mr-1" />{zh ? "記錄成績" : "Log finish time"}
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Timer size={14} className="text-muted-foreground shrink-0" />
                <Input value={hh} onChange={(e) => setHh(e.target.value.replace(/\D/g,""))} placeholder="HH" className="w-14 h-8 text-center text-sm font-mono" />
                <span className="text-muted-foreground">:</span>
                <Input value={mm} onChange={(e) => setMm(e.target.value.replace(/\D/g,""))} placeholder="MM" className="w-14 h-8 text-center text-sm font-mono" />
                <span className="text-muted-foreground">:</span>
                <Input value={ss} onChange={(e) => setSs(e.target.value.replace(/\D/g,""))} placeholder="SS" className="w-14 h-8 text-center text-sm font-mono" />
                <Button size="sm" onClick={handleSave} disabled={saving} className="h-8 ml-1">
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                </Button>
                {hasFinish && (
                  <Button size="sm" variant="ghost" onClick={handleClear} disabled={saving} className="h-8 text-xs">
                    {zh ? "清除" : "Clear"}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving} className="h-8 text-xs">
                  {zh ? "取消" : "Cancel"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
