export default function ProtectedLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 border border-border bg-card shadow-[var(--nb-shadow-sm)] rounded-md animate-pulse" />
        <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          {'// Loading'}
        </span>
      </div>
    </div>
  )
}
