import { Skeleton } from "@/components/ui/feedback";

export default function FamilyDashboardLoading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-44 w-full rounded-[28px]" />
      <div className="grid gap-8 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-6">
          <Skeleton className="h-72 w-full rounded-[20px]" />
          <Skeleton className="h-40 w-full rounded-[20px]" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-52 w-full rounded-[20px]" />
          <Skeleton className="h-48 w-full rounded-[20px]" />
        </div>
      </div>
    </div>
  );
}
