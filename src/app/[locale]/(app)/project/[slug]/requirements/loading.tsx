import { Skeleton } from "@/components/app/states";

export default function RequirementsLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-5 w-2/3" />
      {[0, 1, 2].map((g) => (
        <div key={g} className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ))}
    </div>
  );
}
