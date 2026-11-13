import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/crm/connection', () => ({
  getCrmConnection: vi.fn().mockResolvedValue({
    baseUrl: 'https://crm.test',
    apiKey: 'crmk_test',
    autoPush: false,
    defaultCategory: 'inne',
  }),
  markSync: vi.fn().mockResolvedValue(undefined),
}))

import { markSync } from '@/lib/crm/connection'
import {
  MAX_TRANSACTIONS,
  listBankAccounts,
  listBankTransactions,
  toBankAccount,
  toBankTransaction,
} from '@/lib/crm/bank'

const fetchMock = vi.fn()

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.mocked(markSync).mockClear()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.mocked(console.error).mockRestore()
})

describe('mapowanie rachunku', () => {
  it('zostawia pola potrzebne apce i czyta saldo z liczby albo stringa', () => {
    const account = toBankAccount({
      id: 'acc1', connectionId: 'c1', name: 'Firmowe PKO', providerName: 'PKO BP',
      iban: 'PL61109010140000071219812874', currency: 'PLN', ownerName: 'Programo',
      entityId: 'e1', scope: 'FIRMA', balance: '12345.67', balanceType: 'closingBooked',
      balanceAt: '2026-11-12T10:00:00.000Z', lastSyncAt: '2026-11-12T10:05:00.000Z',
      active: true, createdAt: 'x', updatedAt: 'y',
    })
    expect(account).toEqual({
      id: 'acc1', name: 'Firmowe PKO', providerName: 'PKO BP',
      iban: 'PL61109010140000071219812874', currency: 'PLN', scope: 'FIRMA',
      balance: 12345.67, balanceAt: '2026-11-12T10:00:00.000Z',
      lastSyncAt: '2026-11-12T10:05:00.000Z', active: true,
    })
  })

  it('brak salda zostaje nullem, a nie zerem', () => {
    const account = toBankAccount({ id: 'a', name: '', iban: 'PL00', balance: null })
    expect(account.balance).toBeNull()
    expect(account.name).toBe('PL00')
    expect(account.currency).toBe('PLN')
    expect(account.active).toBe(true)
  })
})

describe('mapowanie transakcji', () => {
  it('przycina datę i zostawia znak kwoty', () => {
    const tx = toBankTransaction({
      id: 't1', accountId: 'acc1', bookingDate: '2026-11-03T00:00:00.000Z', amount: -199.99,
      currency: 'PLN', status: 'BOOK', counterpartyName: 'Hetzner', description: 'Faktura 123',
      matchStatus: 'CONFIRMED', matchScore: 0.98, match: { kind: 'finance', id: 'f1' },
    })
    expect(tx).toEqual({
      id: 't1', accountId: 'acc1', bookingDate: '2026-11-03', amount: -199.99, currency: 'PLN',
      status: 'BOOK', counterpartyName: 'Hetzner', description: 'Faktura 123', matchStatus: 'CONFIRMED',
    })
  })

  it('nieznany status dopasowania i puste pola nie wywracają odczytu', () => {
    const tx = toBankTransaction({ id: 't2', accountId: 'a', bookingDate: '2026-11-04', amount: '50', status: 'PDNG', matchStatus: 'WHATEVER', counterpartyName: '' })
    expect(tx.matchStatus).toBe('NONE')
    expect(tx.status).toBe('PDNG')
    expect(tx.amount).toBe(50)
    expect(tx.counterpartyName).toBeNull()
  })
})

describe('listBankAccounts', () => {
  it('pyta o firmowe rachunki kluczem CRM-a', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { accounts: [{ id: 'a1', name: 'Firma', currency: 'PLN', balance: 100, active: true }] }))
    const res = await listBankAccounts('u1')
    expect(res.ok).toBe(true)
    expect(res.data?.accounts).toHaveLength(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://crm.test/api/v1/bank/accounts?scope=FIRMA')
    expect(init.headers['x-api-key']).toBe('crmk_test')
  })

  it('403 to brak danych, nie błąd połączenia', async () => {
    fetchMock.mockResolvedValueOnce(reply(403, { error: 'Brak dostępu do rachunków prywatnych' }))
    const res = await listBankAccounts('u1')
    expect(res).toEqual({ ok: true, status: 200, data: { accounts: [] }, error: null })
    expect(markSync).toHaveBeenCalledWith('u1', null)
  })

  it('awaria CRM-a wraca jako błąd do przetłumaczenia na 502', async () => {
    fetchMock.mockResolvedValueOnce(reply(500, { error: 'boom' }))
    const res = await listBankAccounts('u1')
    expect(res.ok).toBe(false)
    expect(res.error).toBe('boom')
  })
})

describe('listBankTransactions', () => {
  const tx = (id: string) => ({ id, accountId: 'a1', bookingDate: '2026-11-05', amount: 10, status: 'BOOK', matchStatus: 'NONE' })

  it('idzie po stronach do końca kursora', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { transactions: [tx('1'), tx('2')], nextCursor: '2' }))
      .mockResolvedValueOnce(reply(200, { transactions: [tx('3')], nextCursor: null }))
    const res = await listBankTransactions('u1', { from: '2026-11-01', to: '2026-11-30' })
    expect(res.data?.transactions.map((t) => t.id)).toEqual(['1', '2', '3'])
    expect(res.data?.truncated).toBe(false)
    const second = new URL(fetchMock.mock.calls[1][0])
    expect(second.searchParams.get('cursor')).toBe('2')
    expect(second.searchParams.get('from')).toBe('2026-11-01')
    expect(second.searchParams.get('to')).toBe('2026-11-30')
    expect(second.searchParams.get('scope')).toBe('FIRMA')
  })

  it('ucina na limicie i mówi, że lista jest niepełna', async () => {
    const page = Array.from({ length: 200 }, (_, i) => tx(String(i)))
    fetchMock.mockImplementation(async () => reply(200, { transactions: page, nextCursor: 'more' }))
    const res = await listBankTransactions('u1')
    expect(res.data?.transactions).toHaveLength(MAX_TRANSACTIONS)
    expect(res.data?.truncated).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('403 to pusta lista', async () => {
    fetchMock.mockResolvedValueOnce(reply(403, { error: 'nie' }))
    const res = await listBankTransactions('u1')
    expect(res).toEqual({ ok: true, status: 200, error: null, data: { transactions: [], truncated: false } })
  })

  it('błąd w połowie stronicowania nie oddaje połowy listy', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { transactions: [tx('1')], nextCursor: '1' }))
      .mockResolvedValueOnce(reply(502, { error: 'bank padł' }))
    const res = await listBankTransactions('u1')
    expect(res.ok).toBe(false)
    expect(res.data).toBeNull()
  })
})
