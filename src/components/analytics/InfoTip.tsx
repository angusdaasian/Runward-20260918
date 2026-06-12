import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Props {
  text: string;
  className?: string;
  iconSize?: number;
}

/**
 * Small "(i)" trigger that opens a tooltip-style popover with explanatory text.
 * Works on both touch (tap) and pointer (click) devices.
 */
export default function InfoTip({ text, className, iconSize = 12 }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="More info"
          className={`inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors ${className ?? ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Info size={iconSize} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="max-w-[280px] text-xs leading-relaxed bg-foreground text-background border-foreground p-3"
      >
        {text}
      </PopoverContent>
    </Popover>
  );
}
