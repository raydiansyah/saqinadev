import { Skeleton } from "@/components/app/states";

export default function DashboardLoading() {
  return (
    <div>
      <Skeleton className="mb-8 h-8 w-40" />
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-44" />
        ))}
      </div>
    </div>
  );
}
