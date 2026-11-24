import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/crm/connection', () => ({
  getCrmConnection: vi.fn(),
  markSync: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/session', () => ({ getSession: vi.fn() }))

import { POST } from '@/app/api/crm/entries/route'
import { getCrmConnection } from '@/lib/crm/connection'
import { createEntry } from '@/lib/crm/finance'
import { getSession } from '@/lib/session'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ entry: { id: 'e1' } }), { status: 201 }))
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(getSession).mockResolvedValue({ userId: 'u_1', email: 'a@x.pl' } as never)
  vi.mocked(getCrmConnection).mockResolvedValue({
    baseUrl: 'https://crm.test', apiKey: 'crmk_test', autoPush: false, defaultCategory: 'inne',
  } as never)
})

const sentScope = () => JSON.parse(fetchMock.mock.calls[0][1].body).scope

describe('zakres wpisu w Finansach CRM-a', () => {
  it('wpis dodany w zakładce Firma jest firmowy', async () => {
    const res = await POST(new Request('https://solvio.test/api/crm/entries', {
      method: 'POST',
      body: JSON.stringify({ title: 'Serwer', amount: '49.00', date: '2026-11-24' }),
    }))
    expect(res.status).toBe(201)
    expect(sentScope()).toBe('FIRMA')
  })

  it('wydatek wypchnięty z Solvio zostaje prywatny', async () => {
    await createEntry('u_1', { title: 'Zakupy', amount: '10.00', date: '2026-11-24' }, 'PRYWATNE')
    expect(sentScope()).toBe('PRYWATNE')
  })
})
