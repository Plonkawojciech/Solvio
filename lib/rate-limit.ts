// Simple in-memory rate limiter — resets on serverless cold start (acceptable)
// For distributed rate limiting, upgrade to Upstash Redis

const store = new Map<string, { count: number; resetAt: number }>()

interface RateLimitOptions {
  maxRequests: number
  windowMs: number // time window in milliseconds
}

export function rateLimit(key: string, options: RateLimitOptions): { allowed: boolean; retryAfter?: number } {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + options.windowMs })
    return { allowed: true }
  }

  if (entry.count >= options.maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    return { allowed: false, retryAfter }
  }

  entry.count++
  return { allowed: true }
}

// Clean up expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store.entries()) {
      if (now > entry.resetAt) store.delete(key)
    }
  }, 5 * 60 * 1000)
}
