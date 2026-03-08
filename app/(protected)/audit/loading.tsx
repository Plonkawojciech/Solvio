export default function AuditLoading() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />
      ))}
    </div>
  )
}
