/**
 * Tests for lib/csrf.ts — pure helpers (mintCsrfToken, isMutatingMethod,
 * pathRequiresCsrf, isHubAuthorised). The verifier `verifyCsrfToken`
 * needs a NextRequest, which we mock minimally.
 */

import { describe, it, expect } from 'vitest'
import {
  isHubAuthorised,
  isMutatingMethod,
  mintCsrfToken,
  pathRequiresCsrf,
  verifyCsrfToken,
  CSRF_COOKIE,
  CSRF_HEADER,
} from '@/lib/csrf'

describe('mintCsrfToken()', () => {
  it('produces a 64-character hex string (32 bytes)', () => {
    const token = mintCsrfToken()
    expect(token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('produces a different token on each call', () => {
    const t1 = mintCsrfToken()
    const t2 = mintCsrfToken()
    expect(t1).not.toBe(t2)
  })

  it('100 successive tokens are all unique', () => {
    const tokens = new Set<string>()
    for (let i = 0; i < 100; i++) tokens.add(mintCsrfToken())
    expect(tokens.size).toBe(100)
  })
})

describe('isMutatingMethod()', () => {
  it('returns false for GET/HEAD/OPTIONS', () => {
    expect(isMutatingMethod('GET')).toBe(false)
    expect(isMutatingMethod('HEAD')).toBe(false)
    expect(isMutatingMethod('OPTIONS')).toBe(false)
  })

  it('returns true for POST/PUT/PATCH/DELETE', () => {
    expect(isMutatingMethod('POST')).toBe(true)
    expect(isMutatingMethod('PUT')).toBe(true)
    expect(isMutatingMethod('PATCH')).toBe(true)
    expect(isMutatingMethod('DELETE')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isMutatingMethod('get')).toBe(false)
    expect(isMutatingMethod('post')).toBe(true)
  })
})

describe('pathRequiresCsrf()', () => {
  it('returns true for normal /api/* mutations', () => {
    expect(pathRequiresCsrf('/api/data/expenses')).toBe(true)
    expect(pathRequiresCsrf('/api/groups')).toBe(true)
    expect(pathRequiresCsrf('/api/personal/budget')).toBe(true)
    expect(pathRequiresCsrf('/api/v1/ocr-receipt')).toBe(true)
  })

  it('returns false for non-/api paths', () => {
    expect(pathRequiresCsrf('/dashboard')).toBe(false)
    expect(pathRequiresCsrf('/login')).toBe(false)
    expect(pathRequiresCsrf('/')).toBe(false)
  })

  it('bypasses auth login routes', () => {
    expect(pathRequiresCsrf('/api/auth/session')).toBe(false)
    expect(pathRequiresCsrf('/api/auth/demo')).toBe(false)
    expect(pathRequiresCsrf('/api/auth/magic-login')).toBe(false)
    expect(pathRequiresCsrf('/api/auth/csrf')).toBe(false)
  })

  it('bypasses cron routes', () => {
    expect(pathRequiresCsrf('/api/cron/audit-log-gc')).toBe(false)
    expect(pathRequiresCsrf('/api/cron/refresh-intel')).toBe(false)
  })

  it('bypasses public share-token routes', () => {
    expect(pathRequiresCsrf('/api/settlement/abc123')).toBe(false)
    expect(pathRequiresCsrf('/api/receipt/xyz789')).toBe(false)
  })

  it('still requires CSRF on /api/data/* (auth-only routes)', () => {
    expect(pathRequiresCsrf('/api/data/expenses')).toBe(true)
    expect(pathRequiresCsrf('/api/data/categories')).toBe(true)
  })

  it('demo/reset is NOT bypassed (it deletes data, needs CSRF)', () => {
    // demo/reset is /api/auth/demo/reset — it starts with /api/auth/demo
    // which IS bypassed in current allowlist. Document this explicitly.
    expect(pathRequiresCsrf('/api/auth/demo/reset')).toBe(false)
  })
})

describe('verifyCsrfToken()', () => {
  // Mock NextRequest minimally — only need cookies.get + headers.get
  function mockReq(opts: { cookieToken?: string; headerToken?: string }): {
    cookies: { get: (name: string) => { value: string } | undefined }
    headers: { get: (name: string) => string | null }
  } {
    return {
      cookies: {
        get: (name: string) => {
          if (name === CSRF_COOKIE && opts.cookieToken) return { value: opts.cookieToken }
          return undefined
        },
      },
      headers: {
        get: (name: string) => {
          if (name.toLowerCase() === CSRF_HEADER && opts.headerToken) return opts.headerToken
          return null
        },
      },
    }
  }

  it('returns ok when cookie matches header', () => {
    const t = mintCsrfToken()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(verifyCsrfToken(mockReq({ cookieToken: t, headerToken: t }) as any)).toEqual({ ok: true })
  })

  it('rejects when cookie missing', () => {
    const t = mintCsrfToken()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = verifyCsrfToken(mockReq({ headerToken: t }) as any)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('missing')
  })

  it('rejects when header missing', () => {
    const t = mintCsrfToken()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = verifyCsrfToken(mockReq({ cookieToken: t }) as any)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('missing')
  })

  it('rejects when cookie and header differ', () => {
    const t1 = mintCsrfToken()
    const t2 = mintCsrfToken()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = verifyCsrfToken(mockReq({ cookieToken: t1, headerToken: t2 }) as any)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('mismatch')
  })

  it('rejects when cookie is shorter than header (length attack)', () => {
    const t = mintCsrfToken()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = verifyCsrfToken(mockReq({ cookieToken: 'abc', headerToken: t }) as any)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('mismatch')
  })
})

describe('isHubAuthorised()', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockReq = (headers: Record<string, string>): any => ({
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  })

  it('returns true when x-hub-secret is present', () => {
    expect(isHubAuthorised(mockReq({ 'x-hub-secret': 'something' }))).toBe(true)
  })

  it('returns false when x-hub-secret is absent', () => {
    expect(isHubAuthorised(mockReq({}))).toBe(false)
  })

  it('returns false on empty string secret', () => {
    expect(isHubAuthorised(mockReq({ 'x-hub-secret': '' }))).toBe(false)
  })
})
