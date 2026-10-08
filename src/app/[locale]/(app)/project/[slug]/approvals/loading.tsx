import { Skeleton } from "@/components/app/states";

export default function ApprovalsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-80 max-w-full" />
      {[0, 1].map((i) => (
        <Skeleton key={i} className="h-48 w-full" />
      ))}
    </div>
  );
}
