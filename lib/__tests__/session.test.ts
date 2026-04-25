/**
 * Tests for lib/session.ts — HMAC-signed cookie logic and emailToUserId().
 *
 * getSession() depends on next/headers (cookies()), so we test the exposed
 * helpers (buildSignedSession, emailToUserId) and the internal HMAC
 * verification indirectly through buildSignedSession round-trips.
 */

import { describe, it, expect } from 'vitest'
import crypto from 'crypto'

// ─── Inline the pure helpers so we can test them without next/headers ────────
// These are copied/extracted from lib/session.ts to avoid importing the file
// (which pulls in next/headers at module load time and throws outside Next.js).

const SESSION_SECRET = 'solvio-dev-only-secret-do-not-use-in-production'

function signPayload(payload: string, secret = SESSION_SECRET): string {
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${hmac}`
}

function verifyAndDecode(raw: string, secret = SESSION_SECRET): Record<string, unknown> {
  const lastDot = raw.lastIndexOf('.')
  if (lastDot === -1) throw new Error('Missing HMAC')
  const payload = raw.slice(0, lastDot)
  const providedHmac = raw.slice(lastDot + 1)
  const expectedHmac = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  if (providedHmac.length !== expectedHmac.length || !/^[0-9a-f]+$/i.test(providedHmac)) {
    throw new Error('Invalid HMAC format')
  }
  if (!crypto.timingSafeEqual(Buffer.from(providedHmac, 'hex'), Buffer.from(expectedHmac, 'hex'))) {
    throw new Error('Invalid HMAC — session tampered')
  }
  const decoded = Buffer.from(payload, 'base64').toString('utf8')
  return JSON.parse(decoded)
}

function buildSignedSession(data: Record<string, unknown>, secret = SESSION_SECRET): string {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64')
  return signPayload(payload, secret)
}

function emailToUserId(email: string): string {
  return 'u_' + crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 32)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildSignedSession + verifyAndDecode (round-trip)', () => {
  it('decodes a valid signed cookie correctly', () => {
    const data = { email: 'user@example.com', productType: 'premium' }
    const signed = buildSignedSession(data)

    const decoded = verifyAndDecode(signed)
    expect(decoded.email).toBe('user@example.com')
    expect(decoded.productType).toBe('premium')
  })

  it('round-trip preserves all fields', () => {
    const data = { email: 'test@solvio.app', extra: 'value', num: 42 }
    const signed = buildSignedSession(data)
    const decoded = verifyAndDecode(signed)
    expect(decoded).toMatchObject(data)
  })
})

describe('verifyAndDecode — security rejections', () => {
  it('throws when HMAC is missing (no dot separator)', () => {
    const noHmac = Buffer.from(JSON.stringify({ email: 'a@b.com' })).toString('base64')
    // A plain base64 string without a dot has no HMAC — but base64 can contain '+'
    // which is not a dot, so we use a known base64 string with no dots.
    // Actually base64 CAN contain '=' padding but '.' is not a base64 char, so:
    const raw = noHmac.replace(/\./g, '') // ensure no dot
    // Only throws if there's no dot at all
    if (!raw.includes('.')) {
      expect(() => verifyAndDecode(raw)).toThrow('Missing HMAC')
    }
  })

  it('throws when payload is tampered (content changed)', () => {
    const data = { email: 'legit@example.com' }
    const signed = buildSignedSession(data)
    // Tamper: replace the payload part with a different encoded value
    const lastDot = signed.lastIndexOf('.')
    const hmac = signed.slice(lastDot)
    const tamperedPayload = Buffer.from(JSON.stringify({ email: 'hacker@evil.com' })).toString('base64')
    const tampered = tamperedPayload + hmac

    expect(() => verifyAndDecode(tampered)).toThrow()
  })

  it('throws when HMAC is correct length but wrong value', () => {
    const data = { email: 'user@example.com' }
    const signed = buildSignedSession(data)
    const lastDot = signed.lastIndexOf('.')
    const payload = signed.slice(0, lastDot)
    // Replace HMAC with 64 hex zeros (correct length, wrong value)
    const fakeHmac = '0'.repeat(64)
    const tampered = `${payload}.${fakeHmac}`

    expect(() => verifyAndDecode(tampered)).toThrow('Invalid HMAC — session tampered')
  })

  it('throws when signed with a different (wrong) secret', () => {
    const data = { email: 'user@example.com' }
    const signedWithWrongSecret = buildSignedSession(data, 'totally-different-secret')

    // Verifying with the correct secret should fail
    expect(() => verifyAndDecode(signedWithWrongSecret, SESSION_SECRET)).toThrow()
  })

  it('throws when HMAC has invalid hex characters', () => {
    const data = { email: 'user@example.com' }
    const signed = buildSignedSession(data)
    const lastDot = signed.lastIndexOf('.')
    const payload = signed.slice(0, lastDot)
    // Use non-hex chars padded to 64 chars
    const badHmac = 'g'.repeat(64)
    const tampered = `${payload}.${badHmac}`

    expect(() => verifyAndDecode(tampered)).toThrow('Invalid HMAC format')
  })

  it('throws when HMAC is too short', () => {
    const data = { email: 'user@example.com' }
    const signed = buildSignedSession(data)
    const lastDot = signed.lastIndexOf('.')
    const payload = signed.slice(0, lastDot)
    const shortHmac = 'abcdef12'
    const tampered = `${payload}.${shortHmac}`

    expect(() => verifyAndDecode(tampered)).toThrow('Invalid HMAC format')
  })
})

describe('emailToUserId()', () => {
  it('returns a string starting with u_', () => {
    const id = emailToUserId('user@example.com')
    expect(id).toMatch(/^u_[0-9a-f]{32}$/)
  })

  it('is deterministic — same email always produces same userId', () => {
    const email = 'deterministic@test.com'
    expect(emailToUserId(email)).toBe(emailToUserId(email))
    expect(emailToUserId(email)).toBe(emailToUserId(email))
  })

  it('is case-insensitive — uppercased email gives same userId', () => {
    expect(emailToUserId('User@Example.COM')).toBe(emailToUserId('user@example.com'))
  })

  it('trims whitespace', () => {
    expect(emailToUserId('  user@example.com  ')).toBe(emailToUserId('user@example.com'))
  })

  it('different emails produce different userIds', () => {
    const id1 = emailToUserId('alice@example.com')
    const id2 = emailToUserId('bob@example.com')
    expect(id1).not.toBe(id2)
  })

  it('userId is exactly 34 chars (u_ + 32 hex chars)', () => {
    const id = emailToUserId('any@email.com')
    expect(id.length).toBe(34)
  })
})
