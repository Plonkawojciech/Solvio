import { describe, expect, it } from 'vitest'
import { normalizeItems, serializeItems, sumItems } from '@/lib/receipt-core'
import { contentTypeFor, isLocalKey, publicImagePath, safeFileName } from '@/lib/receipts/storage'
import { createReceiptSchema, toItems, updateReceiptSchema } from '@/lib/receipts/schemas'

describe('pozycje paragonu', () => {
  it('czyta wszystkie historyczne kształty zapisu', () => {
    const items = normalizeItems([
      { name: 'Mleko', quantity: 2, price: 7.58, category_id: 'abc' },
      { name: 'Chleb', quantity: 1, totalPrice: '4.49' },
      { name: 'Banany', quantity: 1.24, unitPrice: 6.49 },
      { name: 'Jajka', quantity: 1, total_price: 12.49, categoryId: 'xyz' },
    ])
    expect(items.map((i) => i.price)).toEqual([7.58, 4.49, 8.05, 12.49])
    expect(items[0].categoryId).toBe('abc')
    expect(items[3].categoryId).toBe('xyz')
  })

  it('pomija wpisy bez nazwy i śmieci', () => {
    expect(normalizeItems([null, 'tekst', { price: 5 }, { name: '   ' }, { name: 'Ser', price: 7 }]))
      .toHaveLength(1)
  })

  it('pusta wartość zamiast tablicy nie wywraca odczytu', () => {
    expect(normalizeItems(null)).toEqual([])
    expect(normalizeItems({ items: [] })).toEqual([])
  })

  it('zapisuje jeden kształt, zgodny z apką iOS', () => {
    const [row] = serializeItems(normalizeItems([{ name: 'Ser', price: 7.49, categoryId: 'cat-1' }]))
    expect(row).toEqual({ name: 'Ser', nameClean: null, quantity: null, price: 7.49, category_id: 'cat-1' })
  })

  it('sumuje pozycje, ignorując brakujące ceny', () => {
    expect(sumItems(normalizeItems([{ name: 'A', price: 1.11 }, { name: 'B' }, { name: 'C', price: 2.22 }])))
      .toBe(3.33)
    expect(sumItems([])).toBeNull()
  })
})

describe('walidacja wejścia', () => {
  it('przyjmuje kwotę jako liczbę i jako tekst z przecinkiem', () => {
    const parsed = createReceiptSchema.parse({ vendor: 'Żabka', total: '23,76', items: [{ name: 'Kawa', price: 9.99 }] })
    expect(parsed.total).toBe(23.76)
    expect(toItems(parsed.items)?.[0].price).toBe(9.99)
  })

  it('odrzuca datę w złym formacie', () => {
    expect(createReceiptSchema.safeParse({ date: '21.08.2026' }).success).toBe(false)
  })

  it('odrzuca nieliczbową kwotę', () => {
    expect(createReceiptSchema.safeParse({ total: 'dużo' }).success).toBe(false)
  })

  it('przelicza cenę jednostkową na cenę linii', () => {
    const parsed = createReceiptSchema.parse({ items: [{ name: 'Banany', quantity: 1.24, unitPrice: 6.49 }] })
    expect(toItems(parsed.items)?.[0].price).toBe(8.05)
  })

  it('puste żądanie edycji to błąd, nie cicha nic-nie-zmiana', () => {
    expect(updateReceiptSchema.safeParse({}).success).toBe(false)
  })
})

describe('magazyn zdjęć', () => {
  it('nazwa pliku bez separatorów i bez wyjścia z katalogu', () => {
    expect(safeFileName('../../etc/passwd', 'image/jpeg')).toBe('passwd.jpg')
    expect(safeFileName('paragon 21.08.jpg', 'image/jpeg')).toBe('paragon-21.08.jpg')
    expect(safeFileName('', 'image/png')).toBe('paragon.png')
  })

  it('rozpoznaje klucz lokalny i historyczny URL', () => {
    expect(isLocalKey('local:user/receipt/plik.jpg')).toBe(true)
    expect(isLocalKey('https://blob.vercel-storage.com/x.jpg')).toBe(false)
    expect(isLocalKey(null)).toBe(false)
  })

  it('typ treści z rozszerzenia', () => {
    expect(contentTypeFor('/data/x/paragon.JPG')).toBe('image/jpeg')
    expect(contentTypeFor('paragon.pdf')).toBe('application/pdf')
    expect(contentTypeFor('paragon.bin')).toBe('application/octet-stream')
  })

  it('klient dostaje ścieżkę API, nigdy klucza magazynu', () => {
    expect(publicImagePath('abc-123')).toBe('/api/data/receipts/abc-123/image')
  })
})
