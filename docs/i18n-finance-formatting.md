# Solvio — i18n / number / date / currency formatting reference

**Last updated:** 2026-05-07 (round 3)
**Scope:** Polish (`pl-PL`) + English (`en-US`) for current product; future-proof for CZ / UA / DE.
**Source of truth:** `docs/research-round3.md` § Executive Summary #5; CLDR + W3C i18n.

---

## Why this exists

Solvio is bilingual (PL + EN) but `lib/i18n.ts` likely uses a naive interpolation pattern that breaks on Polish plurals and may format currencies as `zł 1,234.56` instead of the correct PL `1 234,56 zł`. This doc is the canonical reference.

---

## Number formatting

### Polish (`pl-PL`)
- **Group separator:** non-breaking space (`U+00A0`) — `1 234 567`
- **Decimal separator:** comma — `,56`
- **Combined:** `1 234 567,89`

### English-US (`en-US`)
- **Group separator:** comma — `1,234,567`
- **Decimal separator:** period — `.89`
- **Combined:** `1,234,567.89`

### Implementation
```ts
// lib/format.ts
export function formatNumber(n: number, lang: 'pl' | 'en'): string {
  const locale = lang === 'pl' ? 'pl-PL' : 'en-US'
  return new Intl.NumberFormat(locale).format(n)
}
```

**Never hardcode separators.** Always use `Intl.NumberFormat`.

---

## Currency formatting (PLN, EUR, USD, GBP)

### Polish
- **Format:** `1 234,56 zł` (suffix, with non-breaking space)
- **Note:** Polish bank statements and receipts use `zł` suffix universally. `PLN` prefix is acceptable in technical contexts but feels foreign in UI.

### English
- **Format:** `zł 1,234.56` is acceptable but `PLN 1,234.56` is more international
- **Or with `currencyDisplay: 'narrowSymbol'`:** `zł1,234.56`

### Implementation
```ts
// lib/format.ts
export function formatCurrency(
  amount: number | string,
  currency: 'PLN' | 'EUR' | 'USD' | 'GBP' = 'PLN',
  lang: 'pl' | 'en' = 'pl',
): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount
  const locale = lang === 'pl' ? 'pl-PL' : 'en-US'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(value)
}

// formatCurrency(1234.56, 'PLN', 'pl') === '1 234,56 zł'
// formatCurrency(1234.56, 'PLN', 'en') === 'PLN 1,234.56'
// formatCurrency(1234.56, 'EUR', 'pl') === '1 234,56 €'
// formatCurrency(1234.56, 'USD', 'en') === '$1,234.56'
```

### Audit checklist
- [ ] Find every `formatCurrency` callsite in `app/`, `components/`, `lib/`.
- [ ] Replace any string-concatenation `${amount} zł` or `zł ${amount}` with `formatCurrency()`.
- [ ] iOS: same rule for `Models.swift` formatters; use `NumberFormatter()` with `locale = Locale(identifier: "pl_PL")`.

---

## Date formatting

| Locale | Short | Medium | Long |
|---|---|---|---|
| `pl-PL` | `07.05.2026` | `7 maj 2026` | `7 maja 2026` |
| `en-US` | `5/7/2026` | `May 7, 2026` | `May 7, 2026` |
| `en-GB` | `07/05/2026` | `7 May 2026` | `7 May 2026` |
| ISO neutral | `2026-05-07` | — | — |

### Implementation
```ts
export function formatDate(d: Date | string, lang: 'pl' | 'en', style: 'short'|'medium'|'long' = 'short'): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const locale = lang === 'pl' ? 'pl-PL' : 'en-US'
  return new Intl.DateTimeFormat(locale, { dateStyle: style }).format(date)
}
```

**Recommendation for Solvio:**
- **UI displays:** use `dateStyle: 'medium'` for receipts (`7 maj 2026` / `May 7, 2026`).
- **API responses + DB:** ISO 8601 (`2026-05-07T...`) — never PL/US locale strings.
- **CSV/PDF/DOCX exports:** use the user's locale-formatted date in the user's chosen language.

---

## Plural forms — Polish has 4

This is the most common i18n bug in Polish products. Polish CLDR plural rules:

| Form | Rule | Example |
|---|---|---|
| **one** | n = 1 | `1 paragon` |
| **few** | n ends in 2-4, not 12-14 | `2 paragony`, `3 paragony`, `24 paragony` |
| **many** | n = 0; n ends in 5-9; n ends in 11-14 | `5 paragonów`, `0 paragonów`, `11 paragonów` |
| **other** | rationals (3.5 paragony) — covers floats | `3.5 paragona` |

In English, only `one` and `other`:
| Form | Rule | Example |
|---|---|---|
| **one** | n = 1 | `1 receipt` |
| **other** | else | `0 receipts`, `2 receipts`, `5 receipts` |

### The naive bug
```ts
// BROKEN for Polish
const message = `${count} paragon`  // "5 paragon" ✗
```

### Correct: `Intl.PluralRules`
```ts
const pluralRulesPL = new Intl.PluralRules('pl-PL')
const formsPL = {
  paragon: { one: 'paragon', few: 'paragony', many: 'paragonów', other: 'paragona' },
  wydatek: { one: 'wydatek', few: 'wydatki', many: 'wydatków', other: 'wydatku' },
  grupa:   { one: 'grupa', few: 'grupy', many: 'grup', other: 'grupy' },
  receipt: { one: 'receipt', other: 'receipts' }, // EN
}

function pluralize(count: number, key: keyof typeof formsPL, lang: 'pl' | 'en'): string {
  const rules = lang === 'pl' ? pluralRulesPL : new Intl.PluralRules('en-US')
  const form = rules.select(count) as 'one' | 'few' | 'many' | 'other'
  const dict = formsPL[key]
  return `${count} ${(dict as any)[form] ?? (dict as any).other}`
}

// pluralize(1, 'paragon', 'pl') === '1 paragon'
// pluralize(2, 'paragon', 'pl') === '2 paragony'
// pluralize(5, 'paragon', 'pl') === '5 paragonów'
// pluralize(11, 'paragon', 'pl') === '11 paragonów'
// pluralize(22, 'paragon', 'pl') === '22 paragony'
```

Or use **ICU MessageFormat** (more standard, supported by `format-message`, `formatjs`, `lingui`, `react-intl`):

```
{count, plural,
  =0 {brak paragonów}
  one {# paragon}
  few {# paragony}
  many {# paragonów}
  other {# paragona}
}
```

### Solvio audit checklist
- [ ] Grep `lib/i18n.ts` for any `${count}` template literal in Polish translations.
- [ ] For each one, identify the noun being counted, add CLDR-compliant plural variants.
- [ ] Same for iOS — Swift's `String.localizedStringWithFormat` uses CLDR via `.stringsdict` files. If Solvio's iOS doesn't use `.stringsdict`, this is a bug.

---

## Future scripts (2027 horizon)

If Solvio expands to:

| Locale | Currency | Plural forms | Notes |
|---|---|---|---|
| `cs-CZ` (Czech) | CZK | 4 (one/few/many/other — CZ is CLDR plural form 3 like PL) | `1 234,56 Kč` |
| `uk-UA` (Ukrainian) | UAH | 4 (one/few/many/other) | `1 234,56 ₴` |
| `de-DE` (German) | EUR | 2 (one/other) | `1.234,56 €` (period grouping, comma decimal — opposite of US) |
| `de-CH` (Swiss German) | CHF | 2 | `CHF 1’234.56` (apostrophe grouping!) |
| `sk-SK` (Slovak) | EUR | 4 (same family as CZ/PL) | `1 234,56 €` |

### Font choice
- **Inter** (current Solvio choice — `app/layout.tsx`) supports Latin Extended (covers PL + CZ + SK + DE + most CE).
- For UA → Cyrillic, Inter has Cyrillic subset; verify with `subsets: ['latin', 'latin-ext', 'cyrillic']`.
- For accessibility / dyslexia: consider exposing a "Atkinson Hyperlegible" or "Lexend" font option in user settings (R7+ work). Not blocking.

### RTL readiness
- Not relevant unless Solvio expands to AR / HE — defer.

---

## Tests to add

```ts
// __tests__/i18n-format.test.ts
describe('formatCurrency PL', () => {
  it('formats 1234.56 PLN as "1 234,56 zł"', () => {
    expect(formatCurrency(1234.56, 'PLN', 'pl')).toBe('1 234,56 zł')
  })
})

describe('Polish plurals', () => {
  it('uses "paragon" for 1', () => expect(pluralize(1, 'paragon', 'pl')).toBe('1 paragon'))
  it('uses "paragony" for 2', () => expect(pluralize(2, 'paragon', 'pl')).toBe('2 paragony'))
  it('uses "paragonów" for 5', () => expect(pluralize(5, 'paragon', 'pl')).toBe('5 paragonów'))
  it('uses "paragonów" for 11', () => expect(pluralize(11, 'paragon', 'pl')).toBe('11 paragonów'))
  it('uses "paragony" for 22', () => expect(pluralize(22, 'paragon', 'pl')).toBe('22 paragony'))
  it('uses "paragonów" for 100', () => expect(pluralize(100, 'paragon', 'pl')).toBe('100 paragonów'))
})
```

---

## References

- [W3C i18n — Number, currency, and unit formatting](https://w3c.github.io/i18n-drafts/questions/qa-number-format.en.html)
- [Unicode CLDR — Plural Rules](https://cldr.unicode.org/index/cldr-spec/plural-rules)
- [MDN — Intl.NumberFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat)
- [MDN — Intl.PluralRules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules)
- [Freeformatter — Poland code snippets](https://freeformatter.com/poland-standards-code-snippets.html)
- [SimpleLocalize — ICU MessageFormat](https://simplelocalize.io/blog/posts/what-is-icu/)
- [IntlPull — CLDR Plural Rules complete guide 2026](https://intlpull.com/blog/cldr-plural-rules-complete-guide-2026)
- [Apple — String.localizedStringWithFormat (.stringsdict files)](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPInternational/StringsdictFileFormat/StringsdictFileFormat.html)

---

**Owner:** A5 for spec; whoever wires the formatter changes for code. Backlog items R3-19, R3-20 in `docs/research-round3.md`.
