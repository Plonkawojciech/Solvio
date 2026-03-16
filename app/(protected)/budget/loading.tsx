import { Card, CardContent, CardHeader } from '@/components/ui/card'

export default function BudgetLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-56 rounded bg-muted animate-pulse" />
          <div className="h-4 w-44 rounded bg-muted/60 animate-pulse" />
        </div>
      </div>

      {/* Month selector */}
      <div className="flex items-center justify-center gap-4">
        <div className="h-11 w-11 rounded bg-muted animate-pulse" />
        <div className="h-6 w-40 rounded bg-muted animate-pulse" />
        <div className="h-11 w-11 rounded bg-muted animate-pulse" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-3 w-20 rounded bg-muted animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
            </CardHeader>
            <CardContent>
              <div className="h-7 w-28 rounded bg-muted animate-pulse" style={{ animationDelay: `${i * 80 + 40}ms` }} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Income form */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="h-4 w-24 rounded bg-muted animate-pulse" />
              <div className="h-11 w-full rounded bg-muted animate-pulse" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-24 rounded bg-muted animate-pulse" />
              <div className="h-11 w-full rounded bg-muted animate-pulse" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category budgets */}
      <Card>
        <CardHeader>
          <div className="h-5 w-40 rounded bg-muted animate-pulse" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between">
                <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                <div className="h-4 w-32 rounded bg-muted animate-pulse" />
              </div>
              <div className="h-2 w-full rounded-full bg-muted animate-pulse" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
