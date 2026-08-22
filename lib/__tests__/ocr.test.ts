import { describe, expect, it } from 'vitest'
import { parseLocaleDecimal } from '@/lib/ocr/shared'
import { extractReceiptData } from '@/lib/ocr/extract'
import { fileHash } from '@/lib/ocr/pipeline'
import { findStoreInText, normalizeStoreName } from '@/lib/stores'
import { chatParams, chatWithEffortRetry, isReasoningModel, readContent } from '@/lib/ai-params'

/** Odpowiedź w kształcie Azure prebuilt-receipt — tak samo wygląda wynik vision. */
function azure(options: {
  content?: string
  merchant?: string
  date?: string
  total?: number | string
  currency?: string
  items?: Array<{ name: string; qty?: number; unit?: number; total?: number }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extraFields?: Record<string, any>
}) {
  return {
    analyzeResult: {
      content: options.content ?? '',
      documents: [{
        fields: {
          ...(options.merchant ? { MerchantName: { valueString: options.merchant } } : {}),
          ...(options.date ? { TransactionDate: { valueDate: options.date } } : {}),
          ...(options.total !== undefined
            ? {
              Total: typeof options.total === 'number'
                ? { valueNumber: options.total, ...(options.currency ? { valueCurrency: { currencyCode: options.currency } } : {}) }
                : { valueString: options.total },
            }
            : {}),
          ...(options.items
            ? {
              Items: {
                valueArray: options.items.map((it) => ({
                  valueObject: {
                    Description: { valueString: it.name },
                    ...(it.qty !== undefined ? { Quantity: { valueNumber: it.qty } } : {}),
                    ...(it.unit !== undefined ? { Price: { valueNumber: it.unit } } : {}),
                    ...(it.total !== undefined ? { TotalPrice: { valueNumber: it.total } } : {}),
                  },
                })),
              },
            }
            : {}),
          ...(options.extraFields ?? {}),
        },
      }],
    },
  }
}

describe('parseLocaleDecimal', () => {
  it('czyta zapis polski i angielski', () => {
    expect(parseLocaleDecimal('12,50')).toBe(12.5)
    expect(parseLocaleDecimal('1.234,56')).toBe(1234.56)
    expect(parseLocaleDecimal('1,234.56')).toBe(1234.56)
    expect(parseLocaleDecimal('136,93 zł')).toBe(136.93)
  })

  it('nie myli separatora tysięcy z dziesiętnym', () => {
    expect(parseLocaleDecimal('1,200')).toBe(1200)
    expect(parseLocaleDecimal('1.200')).toBe(1200)
  })

  it('zwraca null dla śmieci', () => {
    expect(parseLocaleDecimal('')).toBeNull()
    expect(parseLocaleDecimal('brak')).toBeNull()
  })
})

describe('extractReceiptData — kwota', () => {
  it('bierze Total, gdy jest', async () => {
    const data = await extractReceiptData(azure({ total: 136.93, merchant: 'Biedronka' }))
    expect(data.total).toBe(136.93)
  })

  it('składa kwotę z Subtotal + TotalTax, gdy nie ma Total', async () => {
    const data = await extractReceiptData(azure({
      merchant: 'Lidl',
      extraFields: { Subtotal: { valueNumber: 100 }, TotalTax: { valueNumber: 23 } },
    }))
    expect(data.total).toBe(123)
  })

  it('czyta kwotę zapisaną jako tekst z przecinkiem', async () => {
    const data = await extractReceiptData(azure({ total: '87,53', merchant: 'Lidl' }))
    expect(data.total).toBe(87.53)
  })

  it('zwraca null, gdy kwoty nie ma nigdzie — pipeline liczy ją z pozycji', async () => {
    const data = await extractReceiptData(azure({ merchant: 'Żabka', items: [{ name: 'Kawa', total: 9.99 }] }))
    expect(data.total).toBeNull()
  })
})

describe('extractReceiptData — waluta', () => {
  it('bierze walutę z pola kwoty', async () => {
    const data = await extractReceiptData(azure({ total: 15.88, currency: 'EUR', merchant: 'REWE' }))
    expect(data.currency).toBe('EUR')
  })

  it('bez pola waluty rozpoznaje ją z tekstu', async () => {
    const data = await extractReceiptData(azure({ total: 15.88, content: 'SUMME EUR 15,88' }))
    expect(data.currency).toBe('EUR')
  })

  it('domyślnie PLN', async () => {
    const data = await extractReceiptData(azure({ total: 23.76, content: 'SUMA PLN 23,76' }))
    expect(data.currency).toBe('PLN')
  })
})

describe('extractReceiptData — pozycje', () => {
  it('wyrzuca linie podsumowań, zostawia produkty', async () => {
    const data = await extractReceiptData(azure({
      merchant: 'Kaufland',
      items: [
        { name: 'Chleb pszenny 600g', total: 5.49 },
        { name: 'SUMA', total: 100 },
        { name: 'PTU A 23%', total: 18.7 },
        { name: 'Karta', total: 100 },
        { name: 'Mleko 2% 1L', qty: 4, unit: 3.29 },
      ],
    }))
    expect(data.items.map((i) => i.name)).toEqual(['Chleb pszenny 600g', 'Mleko 2% 1L'])
  })

  it('mnoży cenę jednostkową przez ilość, gdy nie ma ceny linii', async () => {
    const data = await extractReceiptData(azure({ items: [{ name: 'Jogurt', qty: 3, unit: 2.99 }] }))
    expect(data.items[0].price).toBe(8.97)
  })

  it('wyciąga ilość z nazwy w zapisie „2x …"', async () => {
    const data = await extractReceiptData(azure({ items: [{ name: '2x Woda niegazowana', total: 3.78 }] }))
    expect(data.items[0].quantity).toBe(2)
    expect(data.items[0].name).toBe('Woda niegazowana')
  })

  it('pomija pozycje bez nazwy zamiast zapisywać „nieznany produkt"', async () => {
    const data = await extractReceiptData(azure({
      items: [{ name: '', total: 5 }, { name: '12,99 zł', total: 12.99 }, { name: 'Masło', total: 8.99 }],
    }))
    expect(data.items).toHaveLength(1)
    expect(data.items[0].name).toBe('Masło')
  })
})

describe('extractReceiptData — promocje', () => {
  it('zbiera linie rabatów z kwotą ujemną', async () => {
    const data = await extractReceiptData(azure({
      merchant: 'Lidl',
      total: 87.53,
      content: 'Ser gouda 7,49\nRABAT Lidl Plus -3,00\nPROMOCJA 2+1 gratis -3,29\nSUMA PLN 87,53',
    }))
    expect(data.promotions).toHaveLength(2)
    expect(data.totalSaved).toBeCloseTo(-6.29, 2)
  })

  it('nagłówek „RABATY:" bez kwoty nie jest promocją', async () => {
    const data = await extractReceiptData(azure({ content: 'RABATY:\nSUMA PLN 10,00' }))
    expect(data.promotions).toHaveLength(0)
  })
})

describe('rozpoznawanie sklepu', () => {
  it('zna stacje paliw — „PKN ORLEN S.A." to Orlen', () => {
    expect(normalizeStoreName('PKN ORLEN S.A. Stacja 2841')).toBe('Orlen')
    expect(findStoreInText('PKN ORLEN S.A. Stacja 2841\nul. Bukowska 289')).toBe('Orlen')
  })

  it('„NETTO" z tabelki PTU nie robi ze sklepu Netto', () => {
    const receipt = [
      'PIEKARNIA U JANA', 'ul. Polna 3', 'NIP 779-11-22-333', 'PARAGON FISKALNY',
      'Chleb 5,49', 'Bulka 1,20', 'SUMA PLN 6,69',
      'PTU A 5% netto 6,37 podatek 0,32',
    ].join('\n')
    expect(findStoreInText(receipt)).toBeNull()
  })

  it('nazwę sieci w nagłówku nadal rozpoznaje', () => {
    expect(findStoreInText('NETTO sp. z o.o.\nul. Polna 3\nSUMA PLN 6,69')).toBe('Netto')
  })

  it('znajduje sieć w stopce lojalnościowej', () => {
    expect(findStoreInText('SKLEP 1234\nul. Polna 3\nSUMA 12,00\nKarta Moja Biedronka')).toBe('Biedronka')
  })
})

describe('odcisk pliku', () => {
  it('te same bajty dają ten sam odcisk', () => {
    expect(fileHash(Buffer.from('paragon'))).toBe(fileHash(Buffer.from('paragon')))
    expect(fileHash(Buffer.from('paragon'))).not.toBe(fileHash(Buffer.from('paragon ')))
  })
})

describe('parametry modelu', () => {
  it('gpt-4.x dostaje max_tokens i temperature', () => {
    const params = chatParams({ model: 'gpt-4.1-mini', maxTokens: 500 })
    expect(params).toMatchObject({ max_tokens: 500, temperature: 0 })
    expect(params.reasoning_effort).toBeUndefined()
  })

  it('model rozumujący dostaje max_completion_tokens i ograniczony reasoning', () => {
    expect(isReasoningModel('gpt-5.4-mini')).toBe(true)
    const params = chatParams({ model: 'gpt-5.4-mini', maxTokens: 500 })
    expect(params).toMatchObject({ max_completion_tokens: 500, reasoning_effort: 'minimal' })
    expect(params.temperature).toBeUndefined()
  })

  it('ponawia z wartością podpowiedzianą przez API', async () => {
    const seen: string[] = []
    const create = async (params: Record<string, unknown>) => {
      seen.push(String(params.reasoning_effort))
      if (params.reasoning_effort === 'minimal') {
        throw new Error("400 Unsupported value: 'reasoning_effort' does not support 'minimal' with this model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.")
      }
      return { choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] }
    }
    const result = await chatWithEffortRetry<{ choices: Array<{ message: { content: string } }> }>(
      create, chatParams({ model: 'gpt-5.4-mini', maxTokens: 10 }),
    )
    expect(seen).toEqual(['minimal', 'none'])
    expect(readContent(result).text).toBe('{}')
  })

  it('ucięcie na limicie tokenów jest widoczne, nie ciche', () => {
    expect(readContent({ choices: [{ message: { content: '{"a"' }, finish_reason: 'length' }] }))
      .toEqual({ text: '{"a"', truncated: true })
  })
})

describe('kształt Azure z odczytu vision', () => {
  it('nie dopisuje rabatu, który jest już w tekście — inaczej liczy się dwa razy', async () => {
    const { __testables } = await import('@/lib/ocr/vision')
    const azure = __testables.toAzureShape({
      merchant: 'Rossmann',
      total: 90.42,
      currency: 'PLN',
      raw_text: 'Szampon Isana 17,98\nZNIZKA aplikacja Rossmann -5,00\nSUMA PLN 90,42',
      discounts: [{ label: 'ZNIZKA aplikacja Rossmann', amount: -5 }],
      items: [],
    })
    const data = await extractReceiptData(azure)
    expect(data.promotions).toHaveLength(1)
    expect(data.totalSaved).toBeCloseTo(-5, 2)
  })

  it('dopisuje rabat, którego model nie przepisał do tekstu', async () => {
    const { __testables } = await import('@/lib/ocr/vision')
    const azure = __testables.toAzureShape({
      merchant: 'Lidl',
      total: 87.53,
      raw_text: 'Ser gouda 7,49\nSUMA PLN 87,53',
      discounts: [{ label: 'RABAT Lidl Plus', amount: -3 }],
      items: [],
    })
    const data = await extractReceiptData(azure)
    expect(data.promotions).toHaveLength(1)
    expect(data.totalSaved).toBeCloseTo(-3, 2)
  })
})
