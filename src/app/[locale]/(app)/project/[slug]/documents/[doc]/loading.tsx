import { Skeleton } from "@/components/app/states";

export default function DocumentLoading() {
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="space-y-3 p-6">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="mt-6 h-5 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/6" />
      </div>
    </div>
  );
}
