import { Card, CardContent, CardHeader } from '@/components/ui/card'

export default function InvoicesLoading() {
  return (
    <div className="flex flex-col gap-4 sm:gap-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-2">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-4 w-72 rounded bg-muted/60" />
        </div>
        <div className="h-10 w-36 rounded-lg bg-muted" />
      </div>

      {/* KPI Cards skeleton */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-3 w-20 rounded bg-muted" style={{ animationDelay: `${i * 80}ms` }} />
            </CardHeader>
            <CardContent>
              <div className="h-7 w-24 rounded bg-muted" style={{ animationDelay: `${i * 80 + 40}ms` }} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter bar skeleton */}
      <div className="flex gap-2">
        <div className="h-9 w-[140px] rounded bg-muted" />
        <div className="h-9 flex-1 min-w-[180px] rounded bg-muted" />
        <div className="h-9 w-[150px] rounded bg-muted" />
        <div className="h-9 w-[150px] rounded bg-muted" />
      </div>

      {/* Invoice list skeleton */}
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-2">
              <div className="flex justify-between">
                <div className="space-y-1.5">
                  <div className="h-4 w-36 rounded bg-muted" />
                  <div className="h-3 w-48 rounded bg-muted/60" />
                </div>
                <div className="h-5 w-24 rounded bg-muted" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
