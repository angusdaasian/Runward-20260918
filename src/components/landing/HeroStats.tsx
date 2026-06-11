type Lang = "en" | "zh";

export default function HeroStats({ lang }: { lang: Lang }) {
  const zh = lang === "zh";
  const stats = [
    { value: "20k+", label: zh ? "活躍跑者" : "Active runners" },
    { value: "80+", label: zh ? "國家／地區" : "Countries" },
    { value: "2,000+", label: zh ? "已記錄訓練" : "Workouts logged" },
    { value: "6", label: zh ? "穿戴整合" : "Wearable integrations" },
  ];

  return (
    <div className="relative">
      {/* Mint tab */}
      <div className="inline-flex items-center bg-primary text-primary-foreground px-5 py-2.5 rounded-t-lg">
        <span className="font-display font-bold text-sm tracking-wide">
          {zh ? "產品數據" : "Product Stats"}
        </span>
      </div>
      <div className="border-t border-white/10 grid grid-cols-2 md:grid-cols-4 gap-6 py-6 md:py-7">
        {stats.map((s, i) => (
          <div
            key={i}
            className={`px-4 ${i > 0 ? "md:border-l md:border-white/10" : ""}`}
          >
            <div className="font-display text-3xl md:text-4xl font-bold text-primary leading-none">
              {s.value}
            </div>
            <div className="mt-2 text-xs md:text-sm text-white/70">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
