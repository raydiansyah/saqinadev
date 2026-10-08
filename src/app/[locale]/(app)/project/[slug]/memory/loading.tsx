import { Skeleton } from "@/components/app/states";

export default function MemoryLoading() {
  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-5 w-80 max-w-full" />
        </div>
        <Skeleton className="h-11 w-36" />
      </div>
      <div className="mb-8 flex flex-wrap gap-2">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
          <Skeleton key={i} className="h-9 w-24" />
        ))}
      </div>
      {[0, 1].map((g) => (
        <div key={g} className="mb-10">
          <Skeleton className="mb-3 h-4 w-24" />
          <div className="space-y-3 border-l border-border-strong pl-5">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
