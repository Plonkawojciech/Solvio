import { Card, CardContent, CardHeader } from '@/components/ui/card'

export default function GoalsLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-64 rounded bg-muted animate-pulse" />
          <div className="h-4 w-48 rounded bg-muted/60 animate-pulse" />
        </div>
        <div className="h-11 w-32 rounded-lg bg-muted animate-pulse" />
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-3 w-24 rounded bg-muted animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
            </CardHeader>
            <CardContent>
              <div className="h-7 w-28 rounded bg-muted animate-pulse" style={{ animationDelay: `${i * 80 + 40}ms` }} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Category filter skeleton */}
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
          <div key={i} className="h-9 w-24 rounded-full bg-muted animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>

      {/* Goals grid skeleton */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <Card key={i} className="overflow-hidden">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded bg-muted animate-pulse" />
                <div className="h-4 w-32 rounded bg-muted animate-pulse" />
              </div>
              <div className="flex items-center gap-4">
                <div className="h-[72px] w-[72px] rounded-full bg-muted animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-24 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-32 rounded bg-muted/60 animate-pulse" />
                  <div className="h-3 w-20 rounded bg-muted/60 animate-pulse" />
                </div>
              </div>
              <div className="h-10 w-full rounded-lg bg-muted animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
