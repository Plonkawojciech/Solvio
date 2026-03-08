export default function AnalysisLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-muted animate-pulse" />
        <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}
      </div>
      <div className="h-20 rounded-xl bg-muted animate-pulse" />
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="h-72 rounded-xl bg-muted animate-pulse" />
        <div className="h-72 rounded-xl bg-muted animate-pulse" />
      </div>
    </div>
  )
}
