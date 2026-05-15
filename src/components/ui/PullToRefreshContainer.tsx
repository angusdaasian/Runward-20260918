import { ReactNode } from "react";
import { Loader2, ArrowDown } from "lucide-react";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";

interface Props {
  children: ReactNode;
  onRefresh?: () => void | Promise<void>;
  className?: string;
  style?: React.CSSProperties;
}

const PullToRefreshContainer = ({ children, onRefresh, className, style }: Props) => {
  const { ref, pull, refreshing, threshold } = usePullToRefresh<HTMLDivElement>({ onRefresh });
  const ready = pull >= threshold;
  return (
    <div
      ref={ref}
      className={className ?? "flex-1 overflow-y-auto relative"}
      style={style ?? { paddingBottom: 'calc(5rem + var(--safe-area-bottom, 0px))' }}
    >
      <div
        className="flex items-center justify-center text-muted-foreground overflow-hidden transition-[height] duration-150"
        style={{ height: pull }}
        aria-hidden={pull === 0}
      >
        {refreshing ? (
          <Loader2 size={18} className="animate-spin" />
        ) : pull > 0 ? (
          <ArrowDown
            size={18}
            className="transition-transform"
            style={{ transform: ready ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        ) : null}
      </div>
      {children}
    </div>
  );
};

export default PullToRefreshContainer;
