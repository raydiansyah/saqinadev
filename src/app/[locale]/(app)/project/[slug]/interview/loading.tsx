import { Skeleton } from "@/components/app/states";

export default function InterviewLoading() {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-6 w-20" />
        ))}
      </div>
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
      <div className="grid gap-2 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    </div>
  );
}
