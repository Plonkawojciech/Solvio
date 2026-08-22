import type { ReceiptView } from '@/lib/receipt-core'

/**
 * Paragon wygenerowany online — z danych, nie ze zdjęcia.
 *
 * Po co: zdjęcie bywa nieczytelne, blaknie i nie ma go dla paragonów
 * wpisanych ręcznie. Ten sam układ dostaje więc każdy paragon w systemie:
 * nagłówek sprzedawcy, pozycje, rabaty, suma. Nadaje się do wydruku
 * (`@media print` bez marginesów ekranu) i do osadzenia w CRM-ie.
 *
 * Świadomie bez zależności: czysty string, żeby dało się go oddać z trasy
 * bez podnoszenia Reacta i bez ryzyka, że render zależy od stanu przeglądarki.
 */

const money = (value: number | null | undefined, currency: string): string => {
  if (value === null || value === undefined) return '—'
  return `${value.toFixed(2).replace('.', ',')} ${currency}`
}

const escape = (value: string): string => value.replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c] ?? c))

const qty = (value: number | null): string => {
  if (value === null) return ''
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace('.', ',')
}

export function renderReceiptHtml(receipt: ReceiptView): string {
  const currency = receipt.currency || 'PLN'
  const itemsSum = receipt.items.reduce((sum, item) => sum + (item.price ?? 0), 0)

  const rows = receipt.items.map((item) => {
    const name = escape(item.nameClean || item.name)
    const q = qty(item.quantity)
    return `<tr>
      <td class="name">${name}${q && q !== '1' ? `<span class="qty">× ${q}</span>` : ''}</td>
      <td class="price">${money(item.price, currency)}</td>
    </tr>`
  }).join('\n')

  const discounts = receipt.promotions.map((promo) => `<tr class="discount">
      <td class="name">${escape(promo.label)}</td>
      <td class="price">${promo.amount !== null ? money(promo.amount, currency) : ''}</td>
    </tr>`).join('\n')

  const source = receipt.status === 'manual'
    ? 'Paragon wpisany ręcznie'
    : `Odczytany automatycznie${receipt.ocrModel ? ` (${escape(receipt.ocrModel)})` : ''}`

  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Paragon — ${escape(receipt.vendor || 'bez sprzedawcy')}</title>
<style>
  :root { color-scheme: light; }
  body {
    margin: 0; padding: 24px;
    background: #f7f5f0;
    font-family: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;
    color: #1c1917;
  }
  .paper {
    max-width: 380px; margin: 0 auto; padding: 24px 22px 28px;
    background: #fff; border: 1px solid #e7e2d9; border-radius: 4px;
    box-shadow: 0 1px 3px rgba(28, 25, 23, .08);
  }
  h1 { font-size: 15px; letter-spacing: .06em; text-transform: uppercase; text-align: center; margin: 0 0 4px; }
  .meta { text-align: center; font-size: 11px; color: #78716c; margin-bottom: 16px; }
  hr { border: 0; border-top: 1px dashed #d6d3d1; margin: 12px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  td { padding: 3px 0; vertical-align: top; }
  td.price { text-align: right; white-space: nowrap; padding-left: 12px; }
  .qty { color: #78716c; margin-left: 6px; }
  .discount td { color: #b45309; }
  .sum { font-size: 14px; font-weight: 600; }
  .foot { font-size: 10px; color: #a8a29e; text-align: center; margin-top: 16px; line-height: 1.6; }
  @media print {
    body { background: #fff; padding: 0; }
    .paper { border: 0; box-shadow: none; max-width: none; }
  }
</style>
</head>
<body>
<div class="paper">
  <h1>${escape(receipt.vendor || 'Paragon')}</h1>
  <div class="meta">${receipt.date ? escape(receipt.date) : 'bez daty'}</div>
  <hr>
  <table>
    ${rows || '<tr><td class="name">Brak pozycji</td><td class="price"></td></tr>'}
    ${discounts}
  </table>
  <hr>
  <table>
    ${receipt.items.length && Math.abs(itemsSum - (receipt.total ?? 0)) > 0.01
      ? `<tr><td class="name">Suma pozycji</td><td class="price">${money(itemsSum, currency)}</td></tr>` : ''}
    ${receipt.totalSaved ? `<tr class="discount"><td class="name">Zaoszczędzono</td><td class="price">${money(Math.abs(receipt.totalSaved), currency)}</td></tr>` : ''}
    <tr class="sum"><td class="name">Razem</td><td class="price">${money(receipt.total, currency)}</td></tr>
  </table>
  <div class="foot">
    ${source}<br>
    Solvio · ${escape(receipt.id.slice(0, 8))}
  </div>
</div>
</body>
</html>`
}
