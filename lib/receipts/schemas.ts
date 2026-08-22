import { z } from 'zod'
import type { ReceiptItemView } from '@/lib/receipt-core'

/**
 * Walidacja wejścia paragonu — wspólna dla trasy sesyjnej i kluczowej.
 * Kwoty przychodzą raz jako liczba (apka), raz jako string z przecinkiem
 * (formularz w CRM-ie), więc obie postacie są dopuszczalne.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/

const numberish = z.union([z.number(), z.string()]).transform((raw, ctx) => {
  const value = typeof raw === 'string' ? Number(raw.replace(/\s/g, '').replace(',', '.')) : raw
  if (!Number.isFinite(value)) {
    ctx.addIssue({ code: 'custom', message: 'Nieprawidłowa liczba' })
    return z.NEVER
  }
  return value
})

export const receiptItemSchema = z.object({
  name: z.string().trim().min(1, 'Pozycja musi mieć nazwę').max(200),
  nameClean: z.string().max(200).nullish(),
  quantity: numberish.nullish(),
  price: numberish.nullish(),
  categoryId: z.string().uuid().nullish(),
  // Nazwy z wydanej apki iOS i ze starego zapisu OCR — przyjmujemy oba,
  // zapisujemy jeden kształt.
  category_id: z.string().uuid().nullish(),
  totalPrice: numberish.nullish(),
  unitPrice: numberish.nullish(),
})

export const createReceiptSchema = z.object({
  vendor: z.string().trim().max(200).nullish(),
  date: z.string().regex(DATE, 'Data musi być w formacie YYYY-MM-DD').nullish(),
  total: numberish.nullish(),
  currency: z.string().length(3).optional(),
  items: z.array(receiptItemSchema).max(200).optional(),
  /** `false` = sam paragon, bez wydatku w budżecie. */
  createExpense: z.boolean().optional(),
})

export const updateReceiptSchema = z.object({
  vendor: z.string().trim().max(200).nullish(),
  date: z.string().regex(DATE, 'Data musi być w formacie YYYY-MM-DD').nullish(),
  total: numberish.nullish(),
  currency: z.string().length(3).optional(),
  items: z.array(receiptItemSchema).max(200).optional(),
}).refine((body) => Object.keys(body).length > 0, { message: 'Nie podano żadnej zmiany' })

/** Uzupełnia pola opcjonalne, żeby rdzeń dostał jeden kształt. */
export function toItems(items: z.infer<typeof receiptItemSchema>[] | undefined): ReceiptItemView[] | undefined {
  if (!items) return undefined
  return items.map((item) => {
    const quantity = item.quantity ?? null
    const price = item.price
      ?? item.totalPrice
      ?? (item.unitPrice != null && quantity != null ? Math.round(item.unitPrice * quantity * 100) / 100 : item.unitPrice)
      ?? null
    const categoryId = item.categoryId ?? item.category_id ?? null
    return {
      name: item.name,
      nameClean: item.nameClean ?? null,
      quantity,
      price,
      categoryId,
      category_id: categoryId,
    }
  })
}

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Nieprawidłowe dane'
}
