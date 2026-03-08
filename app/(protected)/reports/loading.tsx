export default function ReportsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-9 w-32 rounded-lg bg-muted animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
      <div className="h-56 rounded-xl bg-muted animate-pulse" />
    </div>
  )
}
