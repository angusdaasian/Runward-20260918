import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FadeInProps {
  children: ReactNode;
  className?: string;
  delay?: string;
}

const FadeIn = ({ children, className, delay }: FadeInProps) => (
  <div
    className={cn("animate-fade-in", className)}
    style={delay ? { animationDelay: delay } : undefined}
  >
    {children}
  </div>
);

export default FadeIn;
