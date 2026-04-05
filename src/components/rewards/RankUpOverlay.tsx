import { useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatRank, getTierColor, type RankTier } from "@/lib/ranks";
import { RANK_EMBLEMS } from "@/lib/rankEmblems";
import confetti from "canvas-confetti";

interface Props {
  show: boolean;
  tier: RankTier;
  division: string;
  onDismiss: () => void;
}

const shatterVariants = {
  hidden: { scale: 3, opacity: 0, filter: "blur(20px)" },
  visible: {
    scale: 1,
    opacity: 1,
    filter: "blur(0px)",
    transition: { type: "spring", stiffness: 150, damping: 12, delay: 0.2 },
  },
  exit: {
    scale: 0.5,
    opacity: 0,
    filter: "blur(10px)",
    transition: { duration: 0.3 },
  },
};

const RankUpOverlay = ({ show, tier, division, onDismiss }: Props) => {
  const color = getTierColor(tier);

  const fireConfetti = useCallback(() => {
    const duration = 2000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors: [color, "#FFD700", "#FFFFFF"],
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors: [color, "#FFD700", "#FFFFFF"],
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }, [color]);

  useEffect(() => {
    if (show) {
      fireConfetti();
      const timer = setTimeout(onDismiss, 5000);
      return () => clearTimeout(timer);
    }
  }, [show, onDismiss, fireConfetti]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDismiss}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/90 backdrop-blur-lg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          />

          {/* Radial glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(circle at 50% 50%, ${color}30, transparent 60%)`,
            }}
          />

          {/* Content */}
          <div className="relative flex flex-col items-center gap-3 px-8">
            {/* RANK UP text */}
            <motion.p
              className="text-xs font-bold tracking-[0.3em] uppercase text-muted-foreground"
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              Rank Up
            </motion.p>

            {/* Emblem with shatter-in effect */}
            <motion.div
              variants={shatterVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="relative"
            >
              <img
                src={RANK_EMBLEMS[tier]}
                alt={`${tier} emblem`}
                className="w-40 h-40 object-contain drop-shadow-[0_0_40px_var(--glow)]"
                style={{ "--glow": `${color}80` } as React.CSSProperties}
                width={512}
                height={512}
              />
            </motion.div>

            {/* Rank name */}
            <motion.h2
              className="text-3xl font-black tracking-wide"
              style={{ color }}
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, type: "spring" }}
            >
              {formatRank(tier, division)}
            </motion.h2>

            {/* Dismiss hint */}
            <motion.p
              className="text-xs text-muted-foreground/60 mt-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5 }}
            >
              Tap anywhere to continue
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default RankUpOverlay;
