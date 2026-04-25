import { Skeleton } from '@/components/ui/skeleton'

export default function ExpensesLoading() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-busy="true" aria-live="polite">
      <Skeleton className="h-9 w-36 rounded-lg" />
      <Skeleton className="h-12 rounded-xl" />
      {[...Array(6)].map((_, i) => (
        <Skeleton key={i} className="h-14 rounded-xl" />
      ))}
    </div>
  )
}
