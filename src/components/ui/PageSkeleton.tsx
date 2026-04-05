import { Skeleton } from "@/components/ui/skeleton";

/** Generic skeleton for tab pages with a title + cards */
export const TabPageSkeleton = () => (
  <div className="px-5 pt-6 max-w-lg mx-auto animate-pulse">
    <Skeleton className="h-9 w-40 mb-6" />
    <Skeleton className="h-24 w-full rounded-xl mb-4" />
    <Skeleton className="h-40 w-full rounded-xl mb-4" />
    <Skeleton className="h-32 w-full rounded-xl" />
  </div>
);

/** Skeleton for activity cards list */
export const ActivityListSkeleton = () => (
  <div className="px-5 pt-6 max-w-lg mx-auto space-y-4 animate-pulse">
    <Skeleton className="h-9 w-40 mb-2" />
    <Skeleton className="h-20 w-full rounded-xl" />
    <Skeleton className="h-48 w-full rounded-xl" />
    <Skeleton className="h-48 w-full rounded-xl" />
  </div>
);

/** Skeleton for settings/more page */
export const SettingsSkeleton = () => (
  <div className="px-5 pt-2 max-w-lg mx-auto space-y-3 animate-pulse">
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
  <div className="px-5 pt-6 max-w-lg mx-auto space-y-3 animate-pulse">
    <Skeleton className="h-8 w-36 mb-1" />
    <Skeleton className="h-4 w-56 mb-4" />
    <Skeleton className="h-20 w-full rounded-xl" />
    <Skeleton className="h-20 w-full rounded-xl" />
    <Skeleton className="h-20 w-full rounded-xl" />
  </div>
);

/** Skeleton for posture analysis page */
export const PostureSkeleton = () => (
  <div className="px-5 pt-6 max-w-lg mx-auto space-y-4 animate-pulse">
    <Skeleton className="h-9 w-48 mb-1" />
    <Skeleton className="h-4 w-64 mb-4" />
    <Skeleton className="h-48 w-full rounded-xl" />
    <Skeleton className="h-32 w-full rounded-xl" />
  </div>
);

/** Skeleton for training page */
export const TrainingSkeleton = () => (
  <div className="px-5 pt-6 max-w-lg mx-auto space-y-4 animate-pulse">
    <Skeleton className="h-10 w-full rounded-lg mb-2" />
    <Skeleton className="h-32 w-full rounded-xl" />
    <Skeleton className="h-48 w-full rounded-xl" />
    <Skeleton className="h-24 w-full rounded-xl" />
  </div>
);
