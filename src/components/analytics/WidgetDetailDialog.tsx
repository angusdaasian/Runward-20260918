import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { ReactNode } from "react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}

const WidgetDetailDialog = ({ open, onOpenChange, title, children }: Props) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 max-h-[90vh] overflow-hidden flex flex-col">
        <VisuallyHidden asChild>
          <DialogTitle>{title}</DialogTitle>
        </VisuallyHidden>
        <div className="px-5 pt-5 pb-2 border-b border-border">
          <h2 className="font-display text-lg font-bold text-foreground">{title}</h2>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </DialogContent>
    </Dialog>
  );
};

export default WidgetDetailDialog;
