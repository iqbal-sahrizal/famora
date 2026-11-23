import { Skeleton } from "@/components/ui/feedback";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-44 w-full rounded-[24px]" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-32 rounded-[20px]" />
        <Skeleton className="h-32 rounded-[20px]" />
      </div>
    </div>
  );
}
