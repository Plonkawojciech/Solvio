/**
 * Tests for lib/category-colors.ts
 *
 * getCategoryColor() uses a djb2-style hash to deterministically map a
 * category ID to one of the 10 palette entries. The same input must always
 * produce the same output; different inputs should generally produce colors
 * drawn from the palette.
 */

import { describe, it, expect } from 'vitest'
import {
  getCategoryColor,
  getCategoryHex,
  getCategoryBadgeClass,
} from '../category-colors'

// All valid hex colors in the palette (for membership checks)
const VALID_HEX_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f97316', // orange
  '#8b5cf6', // purple
  '#f43f5e', // rose
  '#0ea5e9', // sky
  '#f59e0b', // amber
  '#ec4899', // pink
  '#84cc16', // lime
  '#06b6d4', // cyan
]

// ─── getCategoryColor() ───────────────────────────────────────────────────────

describe('getCategoryColor() — determinism', () => {
  it('returns the same color set for the same input (called twice)', () => {
    const id = 'cat-uuid-12345'
    const a = getCategoryColor(id)
    const b = getCategoryColor(id)
    expect(a).toStrictEqual(b)
  })

  it('is deterministic across 10 repeated calls', () => {
    const id = 'stable-category-id'
    const first = getCategoryColor(id)
    for (let i = 0; i < 9; i++) {
      expect(getCategoryColor(id)).toStrictEqual(first)
    }
  })

  it('different inputs can (and do) produce the same color, but are always consistent', () => {
    // The hash may collide — that is expected. What matters is each input is stable.
    const ids = ['cat-a', 'cat-b', 'cat-c', 'cat-d']
    ids.forEach((id) => {
      expect(getCategoryColor(id)).toStrictEqual(getCategoryColor(id))
    })
  })

  it('returns a color from the known palette hex list', () => {
    const color = getCategoryColor('some-category-uuid')
    expect(VALID_HEX_COLORS).toContain(color.hex)
  })

  it('any UUID-shaped input returns a valid palette color', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000'
    const color = getCategoryColor(uuid)
    expect(VALID_HEX_COLORS).toContain(color.hex)
  })
})

describe('getCategoryColor() — return shape', () => {
  it('returned object has all required fields', () => {
    const color = getCategoryColor('test-id')
    expect(color).toHaveProperty('bg')
    expect(color).toHaveProperty('text')
    expect(color).toHaveProperty('badge')
    expect(color).toHaveProperty('dot')
    expect(color).toHaveProperty('hex')
  })

  it('hex value starts with #', () => {
    const color = getCategoryColor('test-id')
    expect(color.hex).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('bg field contains a Tailwind bg- class', () => {
    const color = getCategoryColor('test-id')
    expect(color.bg).toMatch(/bg-\w+/)
  })

  it('text field contains a Tailwind text- class', () => {
    const color = getCategoryColor('test-id')
    expect(color.text).toMatch(/text-\w+/)
  })

  it('dot field contains a Tailwind bg- class', () => {
    const color = getCategoryColor('test-id')
    expect(color.dot).toMatch(/bg-\w+/)
  })

  it('badge field contains both bg and text classes', () => {
    const color = getCategoryColor('test-id')
    expect(color.badge).toMatch(/bg-\w+/)
    expect(color.badge).toMatch(/text-\w+/)
  })
})

describe('getCategoryColor() — different inputs produce colors from palette', () => {
  it('a large set of distinct IDs all resolve to valid palette entries', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `category-${i}`)
    const colors = ids.map((id) => getCategoryColor(id))
    colors.forEach((c) => {
      expect(VALID_HEX_COLORS).toContain(c.hex)
    })
  })

  it('at least half of the palette colors are covered by 50 random IDs', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `coverage-test-id-${i}`)
    const hexSet = new Set(ids.map((id) => getCategoryColor(id).hex))
    // With 50 inputs and 10 palette entries, expect good distribution
    expect(hexSet.size).toBeGreaterThanOrEqual(5)
  })
})

describe('getCategoryColor() — edge cases', () => {
  it('empty string input is handled gracefully (returns a palette color)', () => {
    // Empty string is a valid (if unusual) key — should not throw
    expect(() => getCategoryColor('')).not.toThrow()
    const color = getCategoryColor('')
    expect(VALID_HEX_COLORS).toContain(color.hex)
  })

  it('single-character input returns a valid color', () => {
    const color = getCategoryColor('a')
    expect(VALID_HEX_COLORS).toContain(color.hex)
  })

  it('very long input string returns a valid color', () => {
    const longId = 'a'.repeat(500)
    expect(() => getCategoryColor(longId)).not.toThrow()
    const color = getCategoryColor(longId)
    expect(VALID_HEX_COLORS).toContain(color.hex)
  })

  it('special characters in input do not cause errors', () => {
    const specialIds = ['!@#$%', '中文', 'café', '🔥emoji🔥', ' spaces ']
    specialIds.forEach((id) => {
      expect(() => getCategoryColor(id)).not.toThrow()
      const color = getCategoryColor(id)
      expect(VALID_HEX_COLORS).toContain(color.hex)
    })
  })

  it('numeric string input returns a valid color', () => {
    const color = getCategoryColor('12345')
    expect(VALID_HEX_COLORS).toContain(color.hex)
  })
})

// ─── getCategoryHex() ─────────────────────────────────────────────────────────

describe('getCategoryHex()', () => {
  it('returns the same hex as getCategoryColor().hex', () => {
    const id = 'hex-test-uuid'
    expect(getCategoryHex(id)).toBe(getCategoryColor(id).hex)
  })

  it('returns a valid 6-digit hex color', () => {
    const hex = getCategoryHex('some-id')
    expect(hex).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('is deterministic for the same input', () => {
    const id = 'stable-hex-id'
    expect(getCategoryHex(id)).toBe(getCategoryHex(id))
  })

  it('returns a value from the known palette', () => {
    expect(VALID_HEX_COLORS).toContain(getCategoryHex('any-category'))
  })

  it('handles empty string without throwing', () => {
    expect(() => getCategoryHex('')).not.toThrow()
    expect(VALID_HEX_COLORS).toContain(getCategoryHex(''))
  })
})

// ─── getCategoryBadgeClass() ──────────────────────────────────────────────────

describe('getCategoryBadgeClass()', () => {
  it('returns the same badge string as getCategoryColor().badge', () => {
    const id = 'badge-test-uuid'
    expect(getCategoryBadgeClass(id)).toBe(getCategoryColor(id).badge)
  })

  it('is deterministic for the same input', () => {
    const id = 'stable-badge-id'
    expect(getCategoryBadgeClass(id)).toBe(getCategoryBadgeClass(id))
  })

  it('contains bg- and text- Tailwind classes', () => {
    const badge = getCategoryBadgeClass('some-category')
    expect(badge).toMatch(/bg-\w+/)
    expect(badge).toMatch(/text-\w+/)
  })

  it('handles empty string without throwing', () => {
    expect(() => getCategoryBadgeClass('')).not.toThrow()
    const badge = getCategoryBadgeClass('')
    expect(badge.length).toBeGreaterThan(0)
  })

  it('returns a non-empty string', () => {
    const badge = getCategoryBadgeClass('non-empty-test')
    expect(badge.trim().length).toBeGreaterThan(0)
  })
})
