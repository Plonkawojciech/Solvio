export default function LoyaltyLoading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-44 rounded bg-muted" />
          <div className="h-4 w-64 rounded bg-muted" />
        </div>
        <div className="h-10 w-32 rounded-md bg-muted" />
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card overflow-hidden">
            {/* Color band */}
            <div className="h-2 bg-muted" />
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-muted" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 w-20 rounded bg-muted" />
                  <div className="h-3 w-28 rounded bg-muted" />
                </div>
                <div className="h-4 w-8 rounded-full bg-muted" />
              </div>
              <div className="h-3 w-32 rounded bg-muted" />
              <div className="h-px bg-muted" />
              <div className="flex justify-between">
                <div className="h-4 w-16 rounded bg-muted" />
                <div className="h-5 w-5 rounded bg-muted" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
