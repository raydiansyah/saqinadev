import { Skeleton } from "@/components/app/states";

export default function PlanLoading() {
  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-5 w-80 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-11 w-28" />
          <Skeleton className="h-11 w-32" />
        </div>
      </div>
      <div className="space-y-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-border p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-2 h-6 w-1/2" />
            <Skeleton className="mt-2 h-4 w-3/4" />
            <Skeleton className="mt-4 h-1 w-full" />
            <div className="mt-4 space-y-3">
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-6" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
