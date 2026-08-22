type RouteHandler<Args extends unknown[]> = (...args: Args) => Response | Promise<Response>

const SLOW_API_THRESHOLD_MS = 1_000

function serverTimingToken(name: string) {
  return name.replace(/[^A-Za-z0-9_-]/g, '_')
}

export function withApiTiming<Args extends unknown[]>(
  name: string,
  handler: RouteHandler<Args>,
): RouteHandler<Args> {
  return async (...args: Args) => {
    const startedAt = performance.now()
    const response = await handler(...args)
    const durationMs = Math.round((performance.now() - startedAt) * 10) / 10
    const metric = serverTimingToken(name)

    response.headers.set('Server-Timing', `${metric};dur=${durationMs}`)
    response.headers.set('X-Response-Time', `${durationMs}ms`)

    if (durationMs >= SLOW_API_THRESHOLD_MS) {
      console.warn(`[api-slow] ${name} ${durationMs}ms`)
    }

    return response
  }
}
