export default function PromotionsLoading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded bg-muted" />
          <div className="h-4 w-72 rounded bg-muted" />
        </div>
        <div className="h-10 w-44 rounded-md bg-muted" />
      </div>

      {/* KPI stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="h-7 w-20 rounded bg-muted" />
            <div className="h-3 w-28 rounded bg-muted" />
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="h-8 w-20 rounded-md bg-muted" />
        ))}
      </div>

      {/* Promotion cards */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-5 w-20 rounded bg-muted" />
          <div className="h-3 w-12 rounded bg-muted" />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-3 w-16 rounded bg-muted" />
              <div className="flex items-end gap-3">
                <div className="h-7 w-20 rounded bg-muted" />
                <div className="h-4 w-16 rounded bg-muted/50" />
              </div>
              <div className="h-px bg-muted" />
              <div className="flex justify-between">
                <div className="h-4 w-16 rounded bg-muted" />
                <div className="h-3 w-12 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
