import { cn } from "@/lib/utils";

/**
 * Shared className presets for a compact native segmented switcher.
 * Use with the shadcn <Tabs> primitive:
 *   <TabsList className={underlineTabsListClass}>
 *     <TabsTrigger className={underlineTabsTriggerClass}>...</TabsTrigger>
 *   </TabsList>
 */
export const underlineTabsListClass = cn(
  "native-segmented h-auto justify-start",
);

export const underlineTabsTriggerClass = cn(
  "min-h-9 flex-1 rounded-md bg-transparent px-2 py-2 text-sm font-semibold",
  "text-muted-foreground transition-colors",
  "data-[state=active]:bg-card data-[state=active]:text-foreground",
  "data-[state=active]:shadow-[0_1px_3px_hsl(var(--foreground)/0.08)]",
);
