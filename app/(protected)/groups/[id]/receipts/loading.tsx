import { Skeleton } from '@/components/ui/skeleton'

export default function GroupReceiptsLoading() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6" role="status" aria-busy="true" aria-live="polite">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-10 w-40 rounded-md" />
      </div>
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
