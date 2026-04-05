import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Award } from "lucide-react";
import { formatRank, getTierColor, getTierBg, type RankTier } from "@/lib/ranks";

interface Props {
  show: boolean;
  tier: RankTier;
  division: string;
  onDismiss: () => void;
}

const RankUpOverlay = ({ show, tier, division, onDismiss }: Props) => {
  const color = getTierColor(tier);
  const bg = getTierBg(tier);

  useEffect(() => {
    if (show) {
      const timer = setTimeout(onDismiss, 4000);
      return () => clearTimeout(timer);
    }
  }, [show, onDismiss]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDismiss}
        >
          <div className="absolute inset-0 bg-background/90 backdrop-blur-sm" />
          <motion.div
            className="relative flex flex-col items-center gap-4 p-8 rounded-2xl border-2"
            style={{ borderColor: color, backgroundColor: bg }}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
          >
            <motion.div
              initial={{ rotate: -20, scale: 0 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
            >
              <Award size={64} style={{ color }} />
            </motion.div>

            <motion.h2
              className="text-2xl font-bold text-foreground"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              Rank Up!
            </motion.h2>

            <motion.p
              className="text-xl font-bold"
              style={{ color }}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              {formatRank(tier, division)}
            </motion.p>

            <motion.p
              className="text-sm text-muted-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              Tap to dismiss
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default RankUpOverlay;
