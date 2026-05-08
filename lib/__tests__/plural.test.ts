import { describe, it, expect } from 'vitest'
import { pluralPL, pluralEN, pluralizePL, pluralizeEN } from '../plural'

describe('pluralPL — Polish CLDR plural categories', () => {
  it('returns "one" for n=1', () => {
    expect(pluralPL(1)).toBe('one')
  })

  it('returns "few" for n=2, 3, 4', () => {
    expect(pluralPL(2)).toBe('few')
    expect(pluralPL(3)).toBe('few')
    expect(pluralPL(4)).toBe('few')
  })

  it('returns "many" for n=0, 5..21', () => {
    expect(pluralPL(0)).toBe('many')
    expect(pluralPL(5)).toBe('many')
    expect(pluralPL(6)).toBe('many')
    expect(pluralPL(11)).toBe('many')
    expect(pluralPL(15)).toBe('many')
    expect(pluralPL(21)).toBe('many')
  })

  it('returns "many" for n=12, 13, 14 (the "trap" cases)', () => {
    // The mod-10 of 12,13,14 is 2,3,4 (which would suggest "few"),
    // but CLDR specifies these are "many" because mod-100 ∈ {12,13,14}.
    expect(pluralPL(12)).toBe('many')
    expect(pluralPL(13)).toBe('many')
    expect(pluralPL(14)).toBe('many')
    expect(pluralPL(112)).toBe('many')
    expect(pluralPL(113)).toBe('many')
    expect(pluralPL(114)).toBe('many')
  })

  it('returns "few" for n=22..24, 32..34, 102..104', () => {
    expect(pluralPL(22)).toBe('few')
    expect(pluralPL(23)).toBe('few')
    expect(pluralPL(24)).toBe('few')
    expect(pluralPL(32)).toBe('few')
    expect(pluralPL(102)).toBe('few')
    expect(pluralPL(103)).toBe('few')
    expect(pluralPL(104)).toBe('few')
  })

  it('returns "many" for n=25..30 and round numbers', () => {
    expect(pluralPL(25)).toBe('many')
    expect(pluralPL(26)).toBe('many')
    expect(pluralPL(30)).toBe('many')
    expect(pluralPL(100)).toBe('many')
    expect(pluralPL(1000)).toBe('many')
  })

  it('handles negative numbers via abs', () => {
    expect(pluralPL(-1)).toBe('one')
    expect(pluralPL(-2)).toBe('few')
    expect(pluralPL(-5)).toBe('many')
  })

  it('returns "other" for non-finite values', () => {
    expect(pluralPL(Number.NaN)).toBe('other')
    expect(pluralPL(Number.POSITIVE_INFINITY)).toBe('other')
  })
})

describe('pluralEN — English plural categories', () => {
  it('returns "one" for n=1, "other" otherwise', () => {
    expect(pluralEN(1)).toBe('one')
    expect(pluralEN(0)).toBe('other')
    expect(pluralEN(2)).toBe('other')
    expect(pluralEN(100)).toBe('other')
  })

  it('returns "other" for non-finite values', () => {
    expect(pluralEN(Number.NaN)).toBe('other')
  })
})

describe('pluralizePL — formatted "<count> <form>"', () => {
  it('uses one/few/many for paragon', () => {
    const forms = { one: 'paragon', few: 'paragony', many: 'paragonów' }
    expect(pluralizePL({ count: 1, ...forms })).toBe('1 paragon')
    expect(pluralizePL({ count: 2, ...forms })).toBe('2 paragony')
    expect(pluralizePL({ count: 3, ...forms })).toBe('3 paragony')
    expect(pluralizePL({ count: 4, ...forms })).toBe('4 paragony')
    expect(pluralizePL({ count: 5, ...forms })).toBe('5 paragonów')
    expect(pluralizePL({ count: 12, ...forms })).toBe('12 paragonów')
    expect(pluralizePL({ count: 22, ...forms })).toBe('22 paragony')
    expect(pluralizePL({ count: 25, ...forms })).toBe('25 paragonów')
  })

  it('uses optional "other" override for zero/fractional', () => {
    const forms = { one: 'a', few: 'b', many: 'c', other: 'd' }
    expect(pluralizePL({ count: 0, ...forms })).toBe('0 c') // 0 falls in many for integers
    expect(pluralizePL({ count: Number.NaN, ...forms })).toBe(`${Number.NaN} d`)
  })
})

describe('pluralizeEN — formatted "<count> <form>"', () => {
  it('handles singular vs plural', () => {
    expect(pluralizeEN({ count: 1, one: 'receipt', other: 'receipts' })).toBe('1 receipt')
    expect(pluralizeEN({ count: 0, one: 'receipt', other: 'receipts' })).toBe('0 receipts')
    expect(pluralizeEN({ count: 3, one: 'receipt', other: 'receipts' })).toBe('3 receipts')
  })
})
