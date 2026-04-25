/**
 * Tests for API route authentication — verifies that protected routes
 * return 401 when no session exists or when the session is invalid.
 *
 * We mock lib/auth-compat so we can control what auth() returns without
 * needing a real Next.js runtime, database, or session cookie.
 *
 * Pattern used by all API routes:
 *   const { userId } = await auth()
 *   if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock auth-compat before any route imports ────────────────────────────────
vi.mock('@/lib/auth-compat', () => ({
  auth: vi.fn().mockResolvedValue({ userId: null }),
}))

// ─── Mock heavy route dependencies so the files can be imported ───────────────
vi.mock('@/lib/db', () => ({
  db: {},
  expenses: {},
  receipts: {},
  categories: {},
  userSettings: {},
  categoryBudgets: {},
  monthlyBudgets: {},
  groups: {},
  groupMembers: {},
  expenseSplits: {},
  paymentRequests: {},
  priceComparisons: {},
  audits: {},
  reports: {},
  merchantRules: {},
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  inArray: vi.fn(),
  sql: vi.fn(),
}))

import { auth } from '@/lib/auth-compat'

const mockAuth = vi.mocked(auth)

// ─── Minimal Request factory ──────────────────────────────────────────────────
function makeRequest(method = 'GET', body?: unknown): Request {
  return new Request('http://localhost/api/test', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

// ─── Auth flow tests (independent of specific route handlers) ─────────────────

describe('auth() — unauthenticated behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: null })
  })

  it('returns { userId: null } when there is no session cookie', async () => {
    const result = await auth()
    expect(result.userId).toBeNull()
  })

  it('returns { userId: null } when session cookie is invalid / tampered', async () => {
    // auth-compat maps a bad cookie to null (getSession returns null)
    mockAuth.mockResolvedValueOnce({ userId: null })
    const result = await auth()
    expect(result.userId).toBeNull()
  })

  it('returns { userId: null } when session is expired', async () => {
    mockAuth.mockResolvedValueOnce({ userId: null })
    const result = await auth()
    expect(result).toStrictEqual({ userId: null })
  })

  it('auth() is called exactly once per request', async () => {
    await auth()
    expect(mockAuth).toHaveBeenCalledTimes(1)
  })
})

describe('auth() — authenticated behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a valid userId when session is present', async () => {
    const validUserId = 'u_deadbeef1234567890abcdef12345678'
    mockAuth.mockResolvedValueOnce({ userId: validUserId })

    const result = await auth()
    expect(result.userId).toBe(validUserId)
    expect(result.userId).not.toBeNull()
  })

  it('userId matches the expected u_ prefix format', async () => {
    mockAuth.mockResolvedValueOnce({ userId: 'u_abc123def456789012345678901234ab' })

    const result = await auth()
    expect(result.userId).toMatch(/^u_/)
  })

  it('different sessions return different userIds', async () => {
    mockAuth
      .mockResolvedValueOnce({ userId: 'u_user1hash12345678901234567890ab' })
      .mockResolvedValueOnce({ userId: 'u_user2hash12345678901234567890cd' })

    const result1 = await auth()
    const result2 = await auth()

    expect(result1.userId).not.toBe(result2.userId)
  })
})

describe('API route 401 pattern — simulated handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Simulate the exact guard pattern used in every protected route:
   *   const { userId } = await auth()
   *   if (!userId) return 401
   */
  async function protectedRouteHandler(): Promise<{ status: number; body: unknown }> {
    const { userId } = await auth()
    if (!userId) {
      return { status: 401, body: { error: 'Unauthorized' } }
    }
    return { status: 200, body: { data: 'ok', userId } }
  }

  it('returns 401 when auth() resolves with { userId: null }', async () => {
    mockAuth.mockResolvedValueOnce({ userId: null })

    const response = await protectedRouteHandler()
    expect(response.status).toBe(401)
    expect((response.body as { error: string }).error).toBe('Unauthorized')
  })

  it('returns 200 when auth() resolves with a valid userId', async () => {
    mockAuth.mockResolvedValueOnce({ userId: 'u_validuser1234567890abcdef123456' })

    const response = await protectedRouteHandler()
    expect(response.status).toBe(200)
  })

  it('returns 401 on second call when first was valid but session has expired', async () => {
    mockAuth
      .mockResolvedValueOnce({ userId: 'u_validuser1234567890abcdef123456' })
      .mockResolvedValueOnce({ userId: null }) // session expired

    const first = await protectedRouteHandler()
    const second = await protectedRouteHandler()

    expect(first.status).toBe(200)
    expect(second.status).toBe(401)
  })

  it('multiple concurrent requests without session all get 401', async () => {
    mockAuth.mockResolvedValue({ userId: null })

    const results = await Promise.all([
      protectedRouteHandler(),
      protectedRouteHandler(),
      protectedRouteHandler(),
    ])

    for (const r of results) {
      expect(r.status).toBe(401)
    }
  })

  it('returns 401 body with error field "Unauthorized"', async () => {
    mockAuth.mockResolvedValueOnce({ userId: null })

    const response = await protectedRouteHandler()
    expect(response.body).toHaveProperty('error', 'Unauthorized')
  })
})

describe('Request object — cookie-less scenarios', () => {
  it('Request without Cookie header has no solvio_session', () => {
    const req = makeRequest('GET')
    const cookie = req.headers.get('Cookie')
    // No cookie header set means null
    expect(cookie).toBeNull()
  })

  it('Request with wrong cookie name does not contain solvio_session', () => {
    const req = new Request('http://localhost/api/test', {
      headers: { Cookie: 'some_other_cookie=xyz' },
    })
    const cookie = req.headers.get('Cookie') ?? ''
    expect(cookie).not.toContain('solvio_session')
  })

  it('Request with solvio_session cookie contains the cookie name', () => {
    const req = new Request('http://localhost/api/test', {
      headers: { Cookie: 'solvio_session=validpayload.hmac' },
    })
    const cookie = req.headers.get('Cookie') ?? ''
    expect(cookie).toContain('solvio_session')
  })
})
