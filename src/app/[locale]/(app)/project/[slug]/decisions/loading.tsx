import { Skeleton } from "@/components/app/states";

export default function DecisionsLoading() {
  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-5 w-96 max-w-full" />
        </div>
        <Skeleton className="h-11 w-40" />
      </div>
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-4 rounded-lg border border-border p-5">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-12" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="h-6 w-3/4" />
            <div className="space-y-1.5">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
