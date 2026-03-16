import { Card, CardContent, CardHeader } from '@/components/ui/card'

export default function VatLoading() {
  return (
    <div className="flex flex-col gap-4 sm:gap-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-2">
          <div className="h-8 w-40 rounded bg-muted" />
          <div className="h-4 w-64 rounded bg-muted/60" />
        </div>
        <div className="h-10 w-36 rounded-lg bg-muted" />
      </div>

      {/* Period selector skeleton */}
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded bg-muted" />
        <div className="h-9 w-[180px] rounded-lg bg-muted" />
        <div className="h-9 w-9 rounded bg-muted" />
      </div>

      {/* Summary cards skeleton */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-3 w-24 rounded bg-muted" style={{ animationDelay: `${i * 80}ms` }} />
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="h-8 w-32 rounded bg-muted" />
              <div className="h-3 w-40 rounded bg-muted/60" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart skeleton */}
      <Card>
        <CardHeader>
          <div className="h-5 w-36 rounded bg-muted" />
        </CardHeader>
        <CardContent>
          <div className="h-64 rounded-lg bg-muted" />
        </CardContent>
      </Card>

      {/* Table skeleton */}
      <Card>
        <CardHeader>
          <div className="h-5 w-32 rounded bg-muted" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded bg-muted" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
