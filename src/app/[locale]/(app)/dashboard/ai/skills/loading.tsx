import { Skeleton } from "@/components/app/states";

export default function SkillsLoading() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-28" />
      ))}
    </div>
  );
}
