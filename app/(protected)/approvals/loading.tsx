import { Card, CardContent } from '@/components/ui/card'

export default function ApprovalsLoading() {
  return (
    <div className="flex flex-col gap-4 sm:gap-6 animate-pulse">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-44 rounded bg-muted" />
        <div className="h-4 w-64 rounded bg-muted/60" />
      </div>

      {/* Tabs skeleton */}
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-9 w-32 rounded-lg bg-muted" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>

      {/* Approval cards skeleton */}
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-5 w-5 rounded border bg-muted" />
                  <div className="space-y-1.5">
                    <div className="h-4 w-32 rounded bg-muted" />
                    <div className="h-3 w-44 rounded bg-muted/60" />
                  </div>
                </div>
                <div className="h-5 w-20 rounded bg-muted" />
              </div>
              <div className="flex gap-2 pt-2 border-t">
                <div className="h-8 w-24 rounded bg-muted" />
                <div className="h-8 w-24 rounded bg-muted" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
