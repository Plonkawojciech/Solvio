import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/crm/connection', () => ({
  getCrmConnection: vi.fn(),
  markSync: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/session', () => ({ getSession: vi.fn() }))

import { GET as getDocuments } from '@/app/api/crm/accounting/documents/route'
import { GET as getJpk } from '@/app/api/crm/accounting/jpk/route'
import { GET as getObligations } from '@/app/api/crm/accounting/obligations/route'
import { GET as getOverview } from '@/app/api/crm/accounting/overview/route'
import {
  toAccountingDocument,
  toAccountingEntity,
  toAccountingJpk,
  toAccountingObligation,
} from '@/lib/crm/accounting'
import { getCrmConnection, markSync } from '@/lib/crm/connection'
import { getSession } from '@/lib/session'

const fetchMock = vi.fn()

function reply(status: number, body: unknown) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
}

const ROUTES = {
  overview: getOverview,
  obligations: getObligations,
  documents: getDocuments,
  jpk: getJpk,
}
type Resource = keyof typeof ROUTES

function get(resource: Resource, query = '') {
  return ROUTES[resource](new Request(`https://solvio.test/api/crm/accounting/${resource}${query}`))
}

/** Parametry, z którymi trasa zapytała CRM-a. */
function sent(): Record<string, string> {
  return Object.fromEntries(new URL(fetchMock.mock.calls[0][0]).searchParams)
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.mocked(markSync).mockClear()
  vi.mocked(getCrmConnection).mockResolvedValue({
    baseUrl: 'https://crm.test', apiKey: 'crmk_test', autoPush: false, defaultCategory: 'inne',
  })
  vi.mocked(getSession).mockResolvedValue({ userId: 'u1' } as Awaited<ReturnType<typeof getSession>>)
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.mocked(console.error).mockRestore()
})

const document = {
  id: 'd1', entityKey: 'spolka', entityName: 'Programo s.j.', direction: 'SALE', docType: 'VAT',
  number: '8/10/2026', partyName: 'Klient', partyNip: '7792604466', issueDate: '2026-10-05',
  dueDate: '2026-10-19', paid: false, paidAt: null, daysOverdue: 36, net: 1000, vat: 230, gross: 1230,
  currency: 'PLN', vatPeriod: '2026-10', ksefNumber: '', financeEntryId: 'f1',
  webPath: '/ksiegowosc/spolka?tab=faktury',
}

const obligation = {
  id: 'o1', entityKey: 'wojtek', entityName: 'Wojciech Płonka', kind: 'ZUS', kindLabel: 'ZUS',
  period: '2026-10', dueDate: '2026-11-20', amount: 498.35, paidAmount: null, status: 'PENDING',
  note: '', daysLeft: -4, webPath: '/ksiegowosc/wojtek',
}

const entity = {
  key: 'spolka', name: 'Programo s.j.', taxFormLabel: 'Bez podatku dochodowego', vatLabel: 'VAT miesięczny',
  revenue: 12000, zus: 0, incomeTax: 0, incomeTaxLabel: 'Ryczałt', vat: 2760.5, totalToPay: 2760.5,
  openObligations: 2, overdue: 1, warnings: ['Brak kosztów za październik'],
  receivables: { count: 3, gross: 4500 }, payables: { count: 1, gross: 199.99 },
}

const submission = {
  id: 'j1', entityKey: 'spolka', entityName: 'Programo s.j.', period: '2026-10', env: 'PROD',
  status: 'ACCEPTED', statusLabel: 'przyjęty, jest UPO', accepted: true, hasUpo: true,
  createdAt: '2026-11-20T10:00:00.000Z',
}

describe('mapowanie księgowości', () => {
  it('przepuszcza pełny wiersz bez zmian i gubi pola spoza kontraktu', () => {
    const extra = { ksefReference: '{"xml":"…"}', notes: 'x' }
    expect(toAccountingDocument({ ...document, ...extra })).toEqual(document)
    expect(toAccountingObligation({ ...obligation, ...extra })).toEqual(obligation)
    expect(toAccountingEntity({ ...entity, nip: '7792604466' })).toEqual(entity)
    expect(toAccountingJpk({ ...submission, xml: '<JPK/>' })).toEqual(submission)
  })

  it('czyta kwoty ze stringów, a brakujące zostawia nullem zamiast zera', () => {
    expect(toAccountingDocument({ ...document, gross: '1230.00', net: 'x', vat: undefined })).toMatchObject({
      gross: 1230, net: null, vat: null,
    })
    expect(toAccountingEntity({ key: 'spolka' })).toEqual({
      key: 'spolka', name: 'spolka', taxFormLabel: '', vatLabel: '', revenue: null, zus: null,
      incomeTax: null, incomeTaxLabel: '', vat: null, totalToPay: null, openObligations: 0, overdue: 0,
      warnings: [], receivables: { count: 0, gross: null }, payables: { count: 0, gross: null },
    })
  })

  it('zostawia zero i kwoty ujemne', () => {
    expect(toAccountingDocument({ ...document, gross: -1230, vat: 0 })).toMatchObject({ gross: -1230, vat: 0 })
  })

  it('przycina daty do dnia', () => {
    expect(
      toAccountingDocument({ ...document, issueDate: '2026-10-05T00:00:00.000Z', dueDate: null, paidAt: '2026-10-18T00:00:00.000Z' }),
    ).toMatchObject({ issueDate: '2026-10-05', dueDate: null, paidAt: '2026-10-18' })
  })

  it('nieznane wartości nie udają załatwionych', () => {
    expect(toAccountingObligation({ ...obligation, status: 'NOWY' }).status).toBe('UNCLEAR')
    expect(toAccountingDocument({ ...document, paid: 'tak' }).paid).toBe(false)
    expect(toAccountingJpk({ ...submission, env: 'DEMO', accepted: 1, hasUpo: undefined, statusLabel: '' })).toMatchObject({
      env: 'TEST', accepted: false, hasUpo: false, statusLabel: 'ACCEPTED',
    })
  })

  it.each(['//evil.test/x', '/\\evil.test', '.evil.test', 'https://evil.test', '@evil.test', '', null, 7])(
    'webPath %j nie wyprowadzi apki poza domenę',
    (path) => {
      expect(toAccountingDocument({ ...document, webPath: path }).webPath).toBeNull()
    },
  )
})

describe('trasy /api/crm/accounting', () => {
  it.each(Object.keys(ROUTES) as Resource[])('%s bez sesji to 401 i zero pytań do CRM-a', async (resource) => {
    vi.mocked(getSession).mockResolvedValue(null)
    expect((await get(resource)).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  const EMPTY: Record<Resource, unknown> = {
    overview: { period: null, periodLabel: '', entities: [] },
    obligations: { obligations: [], nextCursor: null },
    documents: { documents: [], nextCursor: null },
    jpk: { submissions: [] },
  }

  const LIST: Record<Resource, string> = {
    overview: 'entities', obligations: 'obligations', documents: 'documents', jpk: 'submissions',
  }

  for (const resource of Object.keys(ROUTES) as Resource[]) {
    it.each([403, 404])(`${resource}: %i z CRM-a to 404 „niedostępne", nie pusty wynik, i nie rusza last_error`, async (status) => {
      fetchMock.mockResolvedValueOnce(reply(status, '<html>Not found</html>'))
      const res = await get(resource)
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'Księgowość niedostępna' })
      expect(markSync).not.toHaveBeenCalled()
    })

    it.each([
      ['HTML', '<html>Zaloguj się</html>'],
      ['puste ciało', ''],
      ['obiekt bez listy', { error: 'boom' }],
      ['lista w złym kształcie', { entities: 'x', obligations: {}, documents: null, submissions: 1 }],
    ])(`${resource}: 200 z CRM-a, ale %s, to 502 z wpisem w last_error`, async (_, body) => {
      fetchMock.mockResolvedValueOnce(reply(200, body))
      const res = await get(resource)
      expect(res.status).toBe(502)
      expect(markSync).toHaveBeenCalledExactlyOnceWith('u1', 'CRM oddał nieoczekiwaną odpowiedź')
    })

    it(`${resource}: prawdziwa pusta lista to 200`, async () => {
      fetchMock.mockResolvedValueOnce(reply(200, { [LIST[resource]]: [] }))
      const res = await get(resource)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual(EMPTY[resource])
      expect(markSync).toHaveBeenCalledExactlyOnceWith('u1', null)
    })

    it.each([401, 429, 500])(`${resource}: %i z CRM-a to 502 z wpisem w last_error`, async (status) => {
      fetchMock.mockResolvedValueOnce(reply(status, { error: 'boom' }))
      const res = await get(resource)
      expect(res.status).toBe(502)
      expect(await res.json()).toEqual({ error: 'boom' })
      expect(markSync).toHaveBeenCalledExactlyOnceWith('u1', 'boom')
    })

    it(`${resource}: nieoczekiwane wiersze nie wywracają trasy`, async () => {
      fetchMock.mockResolvedValueOnce(reply(200, { [LIST[resource]]: [null, 1, { number: 'bez id' }] }))
      const res = await get(resource)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual(EMPTY[resource])
    })
  }

  it('bez połączenia z CRM-em oddaje 502', async () => {
    vi.mocked(getCrmConnection).mockResolvedValue(null)
    const res = await get('overview')
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Brak połączenia z CRM' })
  })

  it('overview pyta kluczem CRM-a i oddaje podmioty', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { period: '2026-10', periodLabel: 'październik 2026', entities: [entity] }))
    const res = await get('overview', '?period=2026-10')
    expect(await res.json()).toEqual({ period: '2026-10', periodLabel: 'październik 2026', entities: [entity] })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://crm.test/api/v1/accounting/overview?period=2026-10')
    expect(init.method).toBe('GET')
    expect(init.headers['x-api-key']).toBe('crmk_test')
  })

  it('overview bez okresu zostawia wybór miesiąca CRM-owi', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { entities: [] }))
    await get('overview')
    expect(fetchMock.mock.calls[0][0]).toBe('https://crm.test/api/v1/accounting/overview')
  })

  it('pusty overview pamięta, o jaki okres pytano', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { entities: [] }))
    expect(await (await get('overview', '?period=2026-09')).json()).toEqual({ period: '2026-09', periodLabel: '', entities: [] })
  })

  it('obligations przepuszcza filtry i oddaje nextCursor', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { obligations: [obligation], nextCursor: 'o1' }))
    const res = await get('obligations', '?status=open&entity=wojtek&limit=20&cursor=o0')
    expect(await res.json()).toEqual({ obligations: [obligation], nextCursor: 'o1' })
    expect(sent()).toEqual({ status: 'open', entity: 'wojtek', limit: '20', cursor: 'o0' })
  })

  it('documents przepuszcza tylko znane parametry i oddaje nextCursor', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { documents: [document], nextCursor: 'd1' }))
    const res = await get(
      'documents',
      '?direction=SALE&entity=spolka&status=overdue&period=2026-10&q=%20ma%C5%82y%20%26%20sp&since=2026-10-01&limit=100&cursor=d0&userId=x&scope=ALL',
    )
    expect(await res.json()).toEqual({ documents: [document], nextCursor: 'd1' })
    expect(sent()).toEqual({
      direction: 'SALE', entity: 'spolka', status: 'overdue', period: '2026-10', q: 'mały & sp',
      since: '2026-10-01T00:00:00.000Z', limit: '100', cursor: 'd0',
    })
  })

  it('zawsze wysyła limit, a puste parametry traktuje jak brak', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { documents: [] }))
    const res = await get('documents', '?q=%20&status=&limit=')
    expect(await res.json()).toEqual({ documents: [], nextCursor: null })
    expect(sent()).toEqual({ limit: '50' })
  })

  it('jpk przepuszcza okres', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { submissions: [submission] }))
    expect(await (await get('jpk', '?period=2026-10&limit=5')).json()).toEqual({ submissions: [submission] })
    expect(sent()).toEqual({ period: '2026-10' })
  })

  it.each<[Resource, string]>([
    ['overview', '?period=2026-13'],
    ['overview', '?period=2026-Q3'],
    ['jpk', '?period=10-2026'],
    ['obligations', '?status=done'],
    ['obligations', '?entity=../users'],
    ['obligations', '?limit=0'],
    ['obligations', '?limit=101'],
    ['documents', '?limit=1.5'],
    ['documents', '?limit=-1'],
    ['documents', '?direction=sale'],
    ['documents', '?status=open'],
    ['documents', '?period=2026-00'],
    ['documents', '?since=wczoraj'],
    ['documents', `?q=${'a'.repeat(101)}`],
    ['documents', `?cursor=${'a'.repeat(201)}`],
  ])('%s%s to 400 bez pytania CRM-a', async (resource, query) => {
    const res = await get(resource, query)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toEqual(expect.any(String))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(markSync).not.toHaveBeenCalled()
  })
})
