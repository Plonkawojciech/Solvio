import { Card, CardContent, CardHeader } from '@/components/ui/card'

export default function ChallengesLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-48 rounded bg-muted animate-pulse" />
          <div className="h-4 w-36 rounded bg-muted/60 animate-pulse" />
        </div>
        <div className="h-11 w-40 rounded-lg bg-muted animate-pulse" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-3 w-24 rounded bg-muted animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
            </CardHeader>
            <CardContent>
              <div className="h-7 w-20 rounded bg-muted animate-pulse" style={{ animationDelay: `${i * 80 + 40}ms` }} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Templates */}
      <Card>
        <CardHeader>
          <div className="h-5 w-40 rounded bg-muted animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Challenge cards */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {[0, 1, 2].map(i => (
          <Card key={i} className="overflow-hidden">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded bg-muted animate-pulse" />
                <div className="h-4 w-32 rounded bg-muted animate-pulse" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <div className="h-3 w-20 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-16 rounded bg-muted animate-pulse" />
                </div>
                <div className="h-2.5 w-full rounded-full bg-muted animate-pulse" />
              </div>
              <div className="h-10 w-full rounded-lg bg-muted animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
