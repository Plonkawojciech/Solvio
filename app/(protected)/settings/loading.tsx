export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="h-9 w-28 rounded-lg bg-muted animate-pulse" />
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
      ))}
    </div>
  )
}
