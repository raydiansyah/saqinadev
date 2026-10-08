import { Skeleton } from "@/components/app/states";

export default function AssistantLoading() {
  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <div className="space-y-2">
        <Skeleton className="h-11 w-full" />
        <div className="hidden space-y-2 lg:block">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
      <Skeleton className="h-[calc(100dvh-14rem)] min-h-[26rem]" />
    </div>
  );
}
