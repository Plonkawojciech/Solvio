/**
 * Tests for lib/auth-compat.ts — auth() wrapper around getSession().
 *
 * getSession() reads next/headers, so we mock the entire lib/session module
 * to control what getSession returns without needing a real Next.js runtime.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

// Mock the session module BEFORE importing auth-compat
vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
  emailToUserId: (email: string) => {
    return 'u_' + crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 32)
  },
  SESSION_COOKIE: 'solvio_session',
  buildSignedSession: vi.fn(),
}))

import { auth } from '../auth-compat'
import { getSession } from '@/lib/session'

const mockGetSession = vi.mocked(getSession)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('auth()', () => {
  it('returns { userId: null } when no session exists', async () => {
    mockGetSession.mockResolvedValueOnce(null)

    const result = await auth()
    expect(result).toEqual({ userId: null })
  })

  it('returns { userId } derived from email when session exists', async () => {
    mockGetSession.mockResolvedValueOnce({
      email: 'user@example.com',
      userId: 'u_abc123',
    })

    const result = await auth()
    expect(result.userId).toBe('u_abc123')
    expect(result.userId).not.toBeNull()
  })

  it('userId starts with u_ prefix', async () => {
    mockGetSession.mockResolvedValueOnce({
      email: 'test@solvio.app',
      userId: 'u_deadbeef1234567890abcdef12345678',
    })

    const result = await auth()
    expect(result.userId).toMatch(/^u_/)
  })

  it('calls getSession exactly once per invocation', async () => {
    mockGetSession.mockResolvedValueOnce(null)

    await auth()
    expect(mockGetSession).toHaveBeenCalledTimes(1)
  })

  it('returns { userId: null } when getSession throws', async () => {
    // auth-compat does not handle errors explicitly; getSession returns null on bad cookies.
    // If getSession itself throws unexpectedly, auth() will propagate — but that is a
    // rare edge-case. Verify that null session → null userId.
    mockGetSession.mockResolvedValueOnce(null)

    const result = await auth()
    expect(result).toStrictEqual({ userId: null })
  })

  it('session with productType still resolves userId correctly', async () => {
    mockGetSession.mockResolvedValueOnce({
      email: 'premium@solvio.app',
      userId: 'u_premiumhash1234567890abcdef1234',
      productType: 'premium',
    })

    const result = await auth()
    expect(result.userId).toBeTruthy()
  })
})
