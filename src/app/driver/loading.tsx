import { Skeleton } from "@/components/ui/skeleton";

export default function DriverLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading your collections">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
    </div>
  );
}
