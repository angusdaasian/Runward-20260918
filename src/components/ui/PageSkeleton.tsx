import { Skeleton } from "@/components/ui/skeleton";

/** Generic skeleton for tab pages with a title + cards */
export const TabPageSkeleton = () => (
  <div className="px-4 pt-5 max-w-lg mx-auto animate-pulse">
    <Skeleton className="h-9 w-40 mb-6" />
    <Skeleton className="h-24 w-full rounded-xl mb-4" />
    <Skeleton className="h-40 w-full rounded-xl mb-4" />
    <Skeleton className="h-32 w-full rounded-xl" />
  </div>
);

/** Skeleton for activity cards list */
export const ActivityListSkeleton = () => (
  <div className="px-4 pt-5 max-w-lg mx-auto space-y-4 animate-pulse">
    <Skeleton className="h-9 w-40 mb-2" />
    <Skeleton className="h-20 w-full rounded-xl" />
    <Skeleton className="h-48 w-full rounded-xl" />
    <Skeleton className="h-48 w-full rounded-xl" />
  </div>
);

/** Skeleton for settings/more page */
export const SettingsSkeleton = () => (
  <div className="px-4 pt-3 max-w-lg mx-auto space-y-3 animate-pulse">
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
    </div>
    <Skeleton className="h-14 w-full rounded-xl" />
    <Skeleton className="h-14 w-full rounded-xl" />
    <Skeleton className="h-14 w-full rounded-xl" />
    <Skeleton className="h-14 w-full rounded-xl" />
    <Skeleton className="h-14 w-full rounded-xl" />
  </div>
);

/** Skeleton for community page */
export const CommunitySkeleton = () => (
  <div className="px-4 pt-5 max-w-lg mx-auto space-y-3 animate-pulse">
    <Skeleton className="h-8 w-36 mb-1" />
    <Skeleton className="h-4 w-56 mb-4" />
    <Skeleton className="h-20 w-full rounded-xl" />
    <Skeleton className="h-20 w-full rounded-xl" />
    <Skeleton className="h-20 w-full rounded-xl" />
  </div>
);

/** Skeleton for posture analysis page */
export const PostureSkeleton = () => (
  <div className="px-4 pt-5 max-w-lg mx-auto space-y-4 animate-pulse">
    <Skeleton className="h-9 w-48 mb-1" />
    <Skeleton className="h-4 w-64 mb-4" />
    <Skeleton className="h-48 w-full rounded-xl" />
    <Skeleton className="h-32 w-full rounded-xl" />
  </div>
);

/** Skeleton for training page */
export const TrainingSkeleton = () => (
  <div className="px-4 pt-5 max-w-lg mx-auto space-y-4 animate-pulse">
    <Skeleton className="h-10 w-full rounded-lg mb-2" />
    <Skeleton className="h-32 w-full rounded-xl" />
    <Skeleton className="h-48 w-full rounded-xl" />
    <Skeleton className="h-24 w-full rounded-xl" />
  </div>
);

/**
 * Single cold-start gate: renders the real app chrome (header row + content +
 * bottom nav) so the first paint has the final layout and nothing shifts when
 * data arrives.
 */
export const AppShellSkeleton = () => (
  <div className="flex flex-col h-screen overflow-hidden bg-background">
    <div style={{ height: "var(--safe-area-top, 0px)" }} className="shrink-0" />
    <div className="flex items-center justify-between px-5 pt-4 pb-2 w-full max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-9 rounded-full" />
        <Skeleton className="h-9 w-9 rounded-full" />
      </div>
    </div>
    <div className="flex-1 overflow-hidden">
      <ActivityListSkeleton />
    </div>
    <div
      className="bottom-nav fixed bottom-0 left-0 right-0 border-t border-border/80 bg-nav-background/95 backdrop-blur-xl"
      style={{ paddingBottom: "var(--safe-area-bottom, 0px)" }}
    >
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <Skeleton className="h-5 w-5 rounded-md" />
            <Skeleton className="h-2 w-8" />
          </div>
        ))}
      </div>
    </div>
  </div>
);
