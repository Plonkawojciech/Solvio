import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], raceRow: null as Record<string, unknown> | null, pushes: 0, categorized: 0 }))

vi.mock('../db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => state.rows.slice(0, 1) }) }) }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        const run = async (conflict: boolean) => {
          if (state.raceRow) { state.rows.push(state.raceRow); state.raceRow = null }
          if (conflict && state.rows.some((r) => r.id === v.id)) return []
          const row = { id: 'generated', createdAt: new Date(), updatedAt: new Date(), crmEntryId: null, ...v }
          state.rows.push(row)
          return [row]
        }
        return { returning: () => run(false), onConflictDoNothing: () => ({ returning: () => run(true) }) }
      },
    }),
  },
}))
vi.mock('../categorize', () => ({ categorizeOne: async () => null }))
import { createExpense, expenseIdForKey } from '../expense-core'

const input = { title: 'Żabka', amount: 12.5, date: '2026-11-20', categoryId: '11111111-1111-4111-8111-111111111111', pushToCrm: false, idempotencyKey: 'bank:abcdef12' }
beforeEach(() => { state.rows.length = 0; state.raceRow = null })

describe('createExpense idempotency', () => {
  it('gives a valid, stable, per-user uuid', () => {
    const a = expenseIdForKey('u1', 'bank:abcdef12')
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(expenseIdForKey('u1', 'bank:abcdef12')).toBe(a)
    expect(expenseIdForKey('u2', 'bank:abcdef12')).not.toBe(a)
  })
  it('returns the same expense on retry', async () => {
    const first = await createExpense('u1', input)
    const again = await createExpense('u1', input)
    expect(again.id).toBe(first.id)
    expect(state.rows).toHaveLength(1)
  })
  it('returns the winner of a concurrent request', async () => {
    state.raceRow = { id: expenseIdForKey('u1', input.idempotencyKey), userId: 'u1', title: 'Żabka', amount: '12.50', currency: 'PLN', date: '2026-11-20', categoryId: null, vendor: null, notes: null, tags: null, receiptId: null, crmEntryId: null, createdAt: new Date(), updatedAt: new Date() }
    const res = await createExpense('u1', input)
    expect(res.id).toBe(expenseIdForKey('u1', input.idempotencyKey))
    expect(state.rows).toHaveLength(1)
  })
})
