export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* Header skeleton */}
      <div className="h-9 w-48 border border-border bg-muted shadow-[var(--nb-shadow-sm)] rounded-md animate-shimmer" />

      {/* Stats cards skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 border border-border bg-card shadow-[var(--nb-shadow-sm)] rounded-lg animate-shimmer" />
        ))}
      </div>

      {/* Charts skeleton */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="h-64 border border-border bg-card shadow-[var(--nb-shadow-sm)] rounded-lg animate-shimmer" />
        <div className="h-64 border border-border bg-card shadow-[var(--nb-shadow-sm)] rounded-lg animate-shimmer" />
      </div>
    </div>
  )
}
