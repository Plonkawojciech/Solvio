import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { receipts, userSettings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { getSession } from '@/lib/session'
import { PrintButton, ShareButton, ViewPhotoButton } from './receipt-actions'
import { ReceiptItems } from './receipt-items'
import { formatAmount, formatDate } from '@/lib/format'

export const dynamic = 'force-dynamic'

async function detectLang(): Promise<'pl' | 'en'> {
  try {
    const hdrs = await headers()
    const accept = hdrs.get('accept-language') || ''
    return accept.toLowerCase().includes('pl') ? 'pl' : 'en'
  } catch {
    return 'pl'
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  try {
    const [receipt] = await db.select().from(receipts).where(eq(receipts.id, id))
    if (!receipt) return { title: 'Receipt — Solvio' }
    return {
      title: `${receipt.vendor || 'Receipt'} — Solvio`,
      description: `Receipt from ${receipt.vendor || 'a store'}${receipt.date ? ` on ${receipt.date}` : ''}`,
    }
  } catch {
    return { title: 'Receipt — Solvio' }
  }
}

type ReceiptItem = {
  name: string
  nameTranslated?: string | null
  quantity?: number | null
  price?: number | null
  category_id?: string | null
}

export default async function SharedReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let session: { userId: string; email: string } | null = null
  try {
    session = await getSession()
  } catch {
    /* not logged in — public page */
  }

  let receipt
  try {
    const [r] = await db.select().from(receipts).where(eq(receipts.id, id))
    receipt = r
  } catch {
    receipt = null
  }

  // ---- Not found ----
  if (!receipt) {
    const lang = await detectLang()
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-lg border-2 border-foreground bg-card shadow-[4px_4px_0_hsl(var(--foreground))] p-8 text-center">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground mb-4">
            {'// SOLVIO'}
          </p>
          <h1 className="text-xl font-bold text-foreground mb-2">
            {lang === 'pl' ? 'Paragon nie znaleziony' : 'Receipt not found'}
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {lang === 'pl'
              ? 'Ten link wygasł lub został usunięty.'
              : 'This link has expired or been removed.'}
          </p>
          <a
            href="https://solvio-lac.vercel.app"
            className="inline-flex items-center justify-center h-11 px-5 w-full border-2 border-foreground bg-foreground text-background text-xs font-bold uppercase tracking-wider font-mono shadow-[3px_3px_0_hsl(var(--foreground))] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_hsl(var(--foreground))] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all rounded-md"
          >
            {lang === 'pl' ? 'Otwórz Solvio' : 'Open Solvio'}
          </a>
        </div>
      </div>
    )
  }

  const isOwner = session?.userId === receipt.userId

  let lang: 'pl' | 'en' = 'pl'
  let accountCurrency = 'PLN'

  if (isOwner && session) {
    const [settings] = await db
      .select({ language: userSettings.language, currency: userSettings.currency })
      .from(userSettings)
      .where(eq(userSettings.userId, session.userId))
      .limit(1)
    lang = (settings?.language as 'pl' | 'en') || 'pl'
    accountCurrency = (settings?.currency || 'PLN').toUpperCase()
  } else {
    lang = await detectLang()
    accountCurrency = (receipt.currency || 'PLN').toUpperCase()
  }

  const t = {
    eyebrow: lang === 'pl' ? 'Paragon elektroniczny' : 'E-Receipt',
    items: lang === 'pl' ? 'pozycji' : 'items',
    subtotal: lang === 'pl' ? 'Suma częściowa' : 'Subtotal',
    tax: lang === 'pl' ? 'Podatek i opłaty' : 'Tax & fees',
    total: lang === 'pl' ? 'Razem' : 'Total',
    noItems: lang === 'pl' ? 'Brak szczegółowych pozycji' : 'No itemized details',
    each: lang === 'pl' ? 'za szt.' : 'each',
    share: lang === 'pl' ? 'Udostępnij' : 'Share',
    copied: lang === 'pl' ? 'Skopiowano!' : 'Copied!',
    print: lang === 'pl' ? 'Drukuj' : 'Print',
    viewPhoto: lang === 'pl' ? 'Zobacz zdjęcie' : 'View photo',
    poweredBy: lang === 'pl' ? 'Wygenerowano przez' : 'Powered by',
    receiptId: lang === 'pl' ? 'Nr paragonu' : 'Receipt ID',
    date: lang === 'pl' ? 'Data' : 'Date',
    paymentCurrency: lang === 'pl' ? 'Waluta' : 'Currency',
    status: lang === 'pl' ? 'Status' : 'Status',
    processed: lang === 'pl' ? 'Przetworzony' : 'Processed',
    processing: lang === 'pl' ? 'W toku' : 'Processing',
    showIn: lang === 'pl' ? 'Pokaż w' : 'Show in',
    approxIn: lang === 'pl' ? 'ok.' : 'approx.',
  }

  const items: ReceiptItem[] = Array.isArray(receipt.items) ? (receipt.items as ReceiptItem[]) : []
  const total = receipt.total ? parseFloat(String(receipt.total)) : null
  const currency = receipt.currency || 'PLN'
  const itemsSubtotal = items.reduce((sum, item) => sum + (item.price ?? 0), 0)
  const heroAmount = total ?? itemsSubtotal

  const exchangeRateNum = receipt.exchangeRate ? parseFloat(receipt.exchangeRate) : null
  const plnEquivalent =
    total !== null && exchangeRateNum ? (total * exchangeRateNum).toFixed(2) : null
  const showApprox = plnEquivalent && currency !== accountCurrency

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://solvio-lac.vercel.app'
  const receiptUrl = `${appUrl}/receipt/${id}`
  const shortId = id.slice(0, 8).toUpperCase()
  const vendor = receipt.vendor || (lang === 'pl' ? 'Paragon' : 'Receipt')

  return (
    <div className="min-h-screen bg-background text-foreground py-8 px-4 print:bg-white print:py-0">
      <main className="mx-auto w-full max-w-md">
        {/* Brand eyebrow — tiny trust badge */}
        <div className="flex items-center justify-center mb-6 print:mb-4">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
            {'// SOLVIO '}{t.eyebrow}
          </span>
        </div>

        {/* Receipt card */}
        <article className="rounded-lg border-2 border-foreground bg-card shadow-[4px_4px_0_hsl(var(--foreground))] overflow-hidden print:shadow-none print:border-black">
          {/* HERO — vendor, date, big total */}
          <header className="px-6 pt-8 pb-7 text-center border-b-2 border-dashed border-border">
            <h1 className="text-2xl font-semibold text-foreground leading-tight break-words">
              {vendor}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground font-mono">
              {formatDate(receipt.date)}
            </p>

            <div className="mt-6 flex items-baseline justify-center gap-2 flex-wrap">
              <span className="text-5xl md:text-6xl font-bold tracking-tight tabular-nums font-mono text-foreground leading-none">
                {formatAmount(heroAmount, currency)}
              </span>
            </div>

            {showApprox && (
              <p className="mt-3 font-mono text-xs text-muted-foreground">
                {t.approxIn} {formatAmount(parseFloat(plnEquivalent!), accountCurrency)}
              </p>
            )}
          </header>

          {/* ITEMS + totals breakdown */}
          <section className="px-6 py-6">
            <ReceiptItems
              items={items}
              total={total}
              currency={currency}
              exchangeRate={exchangeRateNum}
              accountCurrency={accountCurrency}
              t={{
                items: t.items,
                noItems: t.noItems,
                subtotal: t.subtotal,
                tax: t.tax,
                total: t.total,
                each: t.each,
                showIn: t.showIn,
              }}
            />
          </section>

          {/* METADATA — compact key/value grid */}
          <section className="px-6 py-4 border-t-2 border-dashed border-border bg-muted/20">
            <dl className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
              <div>
                <dt className="font-mono uppercase tracking-wider text-muted-foreground text-[10px]">
                  {t.receiptId}
                </dt>
                <dd className="font-mono text-foreground mt-0.5">{shortId}</dd>
              </div>
              <div className="text-right">
                <dt className="font-mono uppercase tracking-wider text-muted-foreground text-[10px]">
                  {t.paymentCurrency}
                </dt>
                <dd className="font-mono text-foreground mt-0.5">{currency}</dd>
              </div>
            </dl>
          </section>

          {/* FOOTER — subtle attribution */}
          <footer className="px-6 py-4 border-t-2 border-border text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              {t.poweredBy}{' '}
              <a
                href="https://solvio-lac.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground font-bold hover:underline underline-offset-4"
              >
                Solvio
              </a>
            </p>
          </footer>
        </article>

        {/* Actions — one primary Share, secondary icon buttons */}
        <div className="mt-6 print:hidden">
          <ShareButton
            url={receiptUrl}
            vendor={receipt.vendor}
            shareLabel={t.share}
            copiedLabel={t.copied}
          />
          <div className="mt-3 flex items-center justify-center gap-3">
            <PrintButton label={t.print} />
            {receipt.imageUrl && (
              <ViewPhotoButton imageUrl={receipt.imageUrl} label={t.viewPhoto} />
            )}
          </div>
        </div>

        {/* Print styles */}
        <style>{`
          @media print {
            body { margin: 0; background: white !important; }
            .print\\:hidden { display: none !important; }
          }
        `}</style>
      </main>
    </div>
  )
}
