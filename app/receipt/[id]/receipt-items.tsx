'use client'

import { useState } from 'react'
import { formatAmount } from '@/lib/format'
import { CurrencyToggle } from './receipt-actions'

type ReceiptItem = {
  name: string
  nameTranslated?: string | null
  quantity?: number | null
  price?: number | null
  category_id?: string | null
}

interface ReceiptItemsProps {
  items: ReceiptItem[]
  total: number | null
  currency: string
  exchangeRate: number | null
  accountCurrency: string
  t: {
    items: string
    noItems: string
    subtotal: string
    tax: string
    total: string
    each: string
    showIn: string
  }
}

/**
 * Modern list-first items view:
 * - Two-column rows (name left, price right)
 * - Mono, right-aligned, tabular-nums for optical alignment
 * - Compact totals breakdown under the list
 */
export function ReceiptItems({
  items,
  total,
  currency,
  exchangeRate,
  accountCurrency,
  t,
}: ReceiptItemsProps) {
  const [showConverted, setShowConverted] = useState(false)

  const canConvert = exchangeRate !== null && exchangeRate > 0 && currency !== accountCurrency
  const displayCurrency = canConvert && showConverted ? accountCurrency : currency
  const multiplier = canConvert && showConverted ? (exchangeRate as number) : 1

  const itemsSubtotal = items.reduce((sum, item) => sum + (item.price ?? 0), 0)
  const displayTotal = total !== null ? total * multiplier : null
  const displayItemsSubtotal = itemsSubtotal * multiplier
  const hasOtherCharges =
    displayTotal !== null &&
    itemsSubtotal > 0 &&
    Math.abs(displayTotal - displayItemsSubtotal) > 0.005 * multiplier

  return (
    <div>
      {canConvert && (
        <div className="flex justify-end mb-3">
          <CurrencyToggle
            showConverted={showConverted}
            onToggle={() => setShowConverted(!showConverted)}
            label={showConverted ? `${t.showIn} ${currency}` : `${t.showIn} ${accountCurrency}`}
          />
        </div>
      )}

      {items.length > 0 ? (
        <ul className="divide-y divide-border">
          {items.map((item, i) => {
            const qty = item.quantity ?? 1
            const price = item.price ?? 0
            const displayPrice = price * multiplier
            const unitPrice = qty > 1 ? displayPrice / qty : null
            const primaryName = item.nameTranslated || item.name
            const secondaryName =
              item.nameTranslated && item.nameTranslated.toLowerCase() !== item.name.toLowerCase()
                ? item.name
                : null

            return (
              <li key={i} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground leading-snug">
                    {qty > 1 && (
                      <span className="font-mono text-muted-foreground mr-1.5 tabular-nums">
                        {qty}×
                      </span>
                    )}
                    <span className="font-medium">{primaryName}</span>
                  </p>
                  {secondaryName && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{secondaryName}</p>
                  )}
                  {unitPrice !== null && qty > 1 && (
                    <p className="text-xs text-muted-foreground font-mono tabular-nums mt-0.5">
                      {formatAmount(unitPrice, displayCurrency)} {t.each}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-sm font-mono font-semibold text-foreground tabular-nums">
                  {formatAmount(displayPrice, displayCurrency)}
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">{t.noItems}</p>
      )}

      {/* Totals breakdown — compact right-aligned mini-table */}
      {(displayTotal !== null || items.length > 0) && (
        <dl className="mt-5 space-y-1.5 text-sm">
          {items.length > 0 && (
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">
                {t.subtotal}
                <span className="font-mono text-xs ml-1.5 opacity-70">
                  ({items.length} {t.items})
                </span>
              </dt>
              <dd className="font-mono text-muted-foreground tabular-nums">
                {formatAmount(displayItemsSubtotal, displayCurrency)}
              </dd>
            </div>
          )}
          {hasOtherCharges && displayTotal !== null && (
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">{t.tax}</dt>
              <dd className="font-mono text-muted-foreground tabular-nums">
                {formatAmount(displayTotal - displayItemsSubtotal, displayCurrency)}
              </dd>
            </div>
          )}
          <div className="flex items-center justify-between pt-2 mt-2 border-t-2 border-foreground">
            <dt className="font-mono text-xs font-bold uppercase tracking-widest text-foreground">
              {t.total}
            </dt>
            <dd className="font-mono text-lg font-bold text-foreground tabular-nums">
              {formatAmount(displayTotal ?? displayItemsSubtotal, displayCurrency)}
            </dd>
          </div>
        </dl>
      )}
    </div>
  )
}
