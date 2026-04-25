/**
 * Tests for lib/rate-limit.ts — in-memory rate limiter.
 *
 * The module uses a module-level Map, so we re-import it fresh each test via
 * vi.resetModules() to avoid state leaking between test cases.
 * Timer mocking is used to simulate window expiry without waiting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// We use vi.useFakeTimers so Date.now() is controllable.
// The module is re-imported inside each test group so the Map starts empty.

describe('rateLimit() — basic allow/deny', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows the first request for a new key', async () => {
    const { rateLimit } = await import('../rate-limit')
    const result = rateLimit('user-1', { maxRequests: 5, windowMs: 60_000 })
    expect(result.allowed).toBe(true)
  })

  it('allows exactly maxRequests requests within the window', async () => {
    const { rateLimit } = await import('../rate-limit')
    const opts = { maxRequests: 3, windowMs: 60_000 }
    const key = 'user-exact'

    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, opts).allowed).toBe(true)
    }
  })

  it('denies the (maxRequests + 1)th request', async () => {
    const { rateLimit } = await import('../rate-limit')
    const opts = { maxRequests: 3, windowMs: 60_000 }
    const key = 'user-overflow'

    rateLimit(key, opts)
    rateLimit(key, opts)
    rateLimit(key, opts)

    const result = rateLimit(key, opts)
    expect(result.allowed).toBe(false)
  })

  it('returns status 429 semantics — denied result has retryAfter', async () => {
    const { rateLimit } = await import('../rate-limit')
    const opts = { maxRequests: 1, windowMs: 30_000 }
    const key = 'user-retry'

    rateLimit(key, opts) // consumes the only allowed request
    const result = rateLimit(key, opts)

    expect(result.allowed).toBe(false)
    expect(result.retryAfter).toBeGreaterThan(0)
  })

  it('retryAfter is approximately windowMs / 1000 seconds', async () => {
    const { rateLimit } = await import('../rate-limit')
    const windowMs = 60_000
    const opts = { maxRequests: 1, windowMs }
    const key = 'user-retry-time'

    rateLimit(key, opts) // exhaust
    const result = rateLimit(key, opts)

    expect(result.allowed).toBe(false)
    // Should be at most windowMs/1000 seconds (may be 1 less due to elapsed ms)
    expect(result.retryAfter).toBeLessThanOrEqual(windowMs / 1000)
    expect(result.retryAfter).toBeGreaterThan(0)
  })

  it('allowed result does not include retryAfter', async () => {
    const { rateLimit } = await import('../rate-limit')
    const result = rateLimit('user-no-retry', { maxRequests: 5, windowMs: 60_000 })
    expect(result.allowed).toBe(true)
    expect(result.retryAfter).toBeUndefined()
  })
})

describe('rateLimit() — independent keys', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('different userIds have independent limits', async () => {
    const { rateLimit } = await import('../rate-limit')
    const opts = { maxRequests: 2, windowMs: 60_000 }

    // Exhaust user-A
    rateLimit('user-A', opts)
    rateLimit('user-A', opts)
    expect(rateLimit('user-A', opts).allowed).toBe(false)

    // user-B is unaffected
    expect(rateLimit('user-B', opts).allowed).toBe(true)
    expect(rateLimit('user-B', opts).allowed).toBe(true)
  })

  it('same key accumulates across multiple calls', async () => {
    const { rateLimit } = await import('../rate-limit')
    const opts = { maxRequests: 5, windowMs: 60_000 }
    const key = 'shared-key'

    for (let i = 0; i < 5; i++) {
      expect(rateLimit(key, opts).allowed).toBe(true)
    }
    expect(rateLimit(key, opts).allowed).toBe(false)
  })

  it('separate keys with maxRequests: 1 each are independent', async () => {
    const { rateLimit } = await import('../rate-limit')
    const opts = { maxRequests: 1, windowMs: 60_000 }

    expect(rateLimit('key-alpha', opts).allowed).toBe(true)
    expect(rateLimit('key-beta', opts).allowed).toBe(true)
    expect(rateLimit('key-gamma', opts).allowed).toBe(true)

    // Second call on each should be denied
    expect(rateLimit('key-alpha', opts).allowed).toBe(false)
    expect(rateLimit('key-beta', opts).allowed).toBe(false)
    expect(rateLimit('key-gamma', opts).allowed).toBe(false)
  })
})

describe('rateLimit() — window reset', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows requests again after the window expires', async () => {
    const { rateLimit } = await import('../rate-limit')
    const windowMs = 60_000
    const opts = { maxRequests: 2, windowMs }
    const key = 'user-window-reset'

    // Exhaust the limit
    rateLimit(key, opts)
    rateLimit(key, opts)
    expect(rateLimit(key, opts).allowed).toBe(false)

    // Advance past the window
    vi.advanceTimersByTime(windowMs + 1)

    // New window — should be allowed again
    expect(rateLimit(key, opts).allowed).toBe(true)
  })

  it('does not reset before the window expires', async () => {
    const { rateLimit } = await import('../rate-limit')
    const windowMs = 60_000
    const opts = { maxRequests: 1, windowMs }
    const key = 'user-no-reset-early'

    rateLimit(key, opts) // exhaust

    // Advance but NOT past the window
    vi.advanceTimersByTime(windowMs - 1000)

    expect(rateLimit(key, opts).allowed).toBe(false)
  })

  it('after window reset the counter starts fresh', async () => {
    const { rateLimit } = await import('../rate-limit')
    const windowMs = 5_000
    const opts = { maxRequests: 3, windowMs }
    const key = 'user-counter-fresh'

    // Use all 3 in the first window
    rateLimit(key, opts)
    rateLimit(key, opts)
    rateLimit(key, opts)
    expect(rateLimit(key, opts).allowed).toBe(false)

    // New window
    vi.advanceTimersByTime(windowMs + 1)

    // Should have full quota again
    expect(rateLimit(key, opts).allowed).toBe(true)
    expect(rateLimit(key, opts).allowed).toBe(true)
    expect(rateLimit(key, opts).allowed).toBe(true)
    expect(rateLimit(key, opts).allowed).toBe(false)
  })
})
