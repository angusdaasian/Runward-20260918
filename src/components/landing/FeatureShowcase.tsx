import IPhoneFrame from "./IPhoneFrame";
import { motion } from "framer-motion";

interface FeatureShowcaseProps {
  title: string;
  description: string;
  screenshot: string;
  screenshotAlt: string;
  reverse?: boolean;
  badge?: string;
}

const FeatureShowcase = ({ title, description, screenshot, screenshotAlt, reverse, badge }: FeatureShowcaseProps) => (
  <div className={`grid md:grid-cols-2 gap-12 md:gap-20 items-center ${reverse ? "md:[direction:rtl]" : ""}`}>
    <motion.div
      className="md:[direction:ltr]"
      initial={{ opacity: 0, x: reverse ? 40 : -40 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      {badge && (
        <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold tracking-wide uppercase mb-4">
          {badge}
        </span>
      )}
      <h3 className="font-display text-2xl md:text-3xl font-bold mb-4 leading-tight">{title}</h3>
      <p className="text-muted-foreground leading-relaxed text-base md:text-lg">{description}</p>
    </motion.div>
    <motion.div
      className="flex justify-center md:[direction:ltr]"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
    >
      <IPhoneFrame src={screenshot} alt={screenshotAlt} className="w-[220px] md:w-[260px]" />
    </motion.div>
  </div>
);

export default FeatureShowcase;
