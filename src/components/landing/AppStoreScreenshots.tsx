import { motion } from "framer-motion";

import en1 from "@/assets/appstore/en-1.png.asset.json";
import en2 from "@/assets/appstore/en-2.png.asset.json";
import en3 from "@/assets/appstore/en-3.png.asset.json";
import en4 from "@/assets/appstore/en-4.png.asset.json";
import en5 from "@/assets/appstore/en-5.png.asset.json";
import zh1 from "@/assets/appstore/zh-1.png.asset.json";
import zh2 from "@/assets/appstore/zh-2.png.asset.json";
import zh3 from "@/assets/appstore/zh-3.png.asset.json";
import zh4 from "@/assets/appstore/zh-4.png.asset.json";
import zh5 from "@/assets/appstore/zh-5.png.asset.json";

const en = [en1, en2, en3, en4, en5];
const zh = [zh1, zh2, zh3, zh4, zh5];

interface Props {
  lang: "en" | "zh";
}

export default function AppStoreScreenshots({ lang }: Props) {
  const isZh = lang === "zh";
  const shots = isZh ? zh : en;

  return (
    <section className="px-6 py-20 md:py-28 bg-card/30 border-y border-border overflow-hidden">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12 md:mb-16">
          <span className="inline-block px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-semibold tracking-wide uppercase mb-4">
            {isZh ? "App Store 預覽" : "On the App Store"}
          </span>
          <h2 className="font-display text-3xl md:text-5xl font-bold tracking-tight">
            {isZh ? "看看應用內部" : "A look inside the app"}
          </h2>
          <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
            {isZh
              ? "從追蹤、訓練到分析,一切都為跑者而設計。"
              : "From tracking to training to analytics — built end-to-end for runners."}
          </p>
        </div>

        <div className="relative -mx-6 px-6">
          <div className="flex gap-5 md:gap-7 overflow-x-auto pb-6 snap-x snap-mandatory scrollbar-thin">
            {shots.map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="snap-start shrink-0 w-[220px] md:w-[260px] rounded-2xl overflow-hidden shadow-xl shadow-foreground/10 ring-1 ring-border bg-background"
              >
                <img
                  src={s.url}
                  alt={`App Store screenshot ${i + 1}`}
                  className="w-full h-auto block"
                  loading="lazy"
                />
              </motion.div>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-card/60 to-transparent" />
        </div>
      </div>
    </section>
  );
}
