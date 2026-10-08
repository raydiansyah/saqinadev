import { Skeleton } from "@/components/app/states";

export default function AgentsLoading() {
  return (
    <div>
      <div className="mb-8 space-y-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <Skeleton className="mb-8 h-14" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="space-y-4 rounded-lg border border-border p-5">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-24" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-9 w-24" />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-12 space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
        <div className="grid gap-4 pt-2 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <Skeleton className="h-64" />
          <Skeleton className="h-96" />
        </div>
      </div>
    </div>
  );
}
