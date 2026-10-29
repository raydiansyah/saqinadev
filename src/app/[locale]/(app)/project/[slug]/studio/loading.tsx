import { Skeleton } from "@/components/app/states";

export default function StudioLoading() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Skeleton className="h-[60dvh]" />
      <Skeleton className="hidden h-[60dvh] lg:block" />
    </div>
  );
}
