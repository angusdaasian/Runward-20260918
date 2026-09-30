import { cn } from "@/lib/utils";

/**
 * Shared className presets for an underline-style tab switcher.
 * Use with the shadcn <Tabs> primitive:
 *   <TabsList className={underlineTabsListClass}>
 *     <TabsTrigger className={underlineTabsTriggerClass}>...</TabsTrigger>
 *   </TabsList>
 */
export const underlineTabsListClass = cn(
  "w-full h-auto p-0 bg-transparent rounded-none border-b border-border",
  "justify-start gap-0",
);

export const underlineTabsTriggerClass = cn(
  "flex-1 rounded-none bg-transparent px-2 pb-3 pt-2 text-base font-semibold",
  "text-muted-foreground hover:text-foreground transition-colors",
  "border-b-2 border-transparent -mb-px",
  "data-[state=active]:bg-transparent data-[state=active]:shadow-none",
  "data-[state=active]:text-foreground data-[state=active]:border-foreground",
);
