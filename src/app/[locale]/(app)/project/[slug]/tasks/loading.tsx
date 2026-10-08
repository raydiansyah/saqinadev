import { Skeleton } from "@/components/app/states";

const COLUMNS = [0, 1, 2, 3, 4, 5];

export default function TasksLoading() {
  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-5 w-72 max-w-full" />
        </div>
        <Skeleton className="h-11 w-28" />
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {[0, ...COLUMNS].map((i) => (
          <Skeleton key={i} className="h-9 w-20" />
        ))}
      </div>
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-4 lg:overflow-hidden">
        {COLUMNS.map((col) => (
          <div
            key={col}
            className={col > 1 ? "hidden lg:block lg:w-64 lg:shrink-0" : "lg:w-64 lg:shrink-0"}
          >
            <Skeleton className="mb-3 h-6 w-full" />
            <div className="space-y-3">
              {[0, 1].map((card) => (
                <Skeleton key={card} className="h-36" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
