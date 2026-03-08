export default function ExpensesLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-9 w-36 rounded-lg bg-muted animate-pulse" />
      <div className="h-12 rounded-xl bg-muted animate-pulse" />
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />
      ))}
    </div>
  )
}
