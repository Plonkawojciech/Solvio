import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, expenses, categories } from '@/lib/db'
import { eq, gte, lte, and, inArray, sql } from 'drizzle-orm'
import { buildCsvBuffer, buildPdfBuffer, buildDocxBuffer } from '@/lib/reports/builders'
import JSZip from 'jszip'
import { z } from 'zod'

const CustomReportSchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  minAmount: z.union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d+)?$/).transform(Number)]).optional().nullable(),
  maxAmount: z.union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d+)?$/).transform(Number)]).optional().nullable(),
  categories: z.array(z.string()).optional().default([]),
  formatPdf: z.boolean().optional(),
  formatCsv: z.boolean().optional(),
  formatDocx: z.boolean().optional(),
  currency: z.string().length(3).optional().default('PLN'),
})

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rawBody = await request.json().catch(() => null)
  if (!rawBody) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const parsedReq = CustomReportSchema.safeParse(rawBody)
  if (!parsedReq.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsedReq.error.flatten().fieldErrors }, { status: 400 })
  }

  const {
    dateFrom,
    dateTo,
    minAmount,
    maxAmount,
    categories: categoryFilter,
    formatPdf,
    formatCsv,
    formatDocx,
    currency,
  } = parsedReq.data

  // Build query conditions — push all filters to SQL, not JS
  const conditions = [eq(expenses.userId, userId)]
  if (dateFrom) conditions.push(gte(expenses.date, dateFrom))
  if (dateTo) conditions.push(lte(expenses.date, dateTo))
  // PERF FIX: amount filtering in SQL via CAST (amounts stored as decimal text)
  if (minAmount != null) conditions.push(sql`CAST(${expenses.amount} AS NUMERIC) >= ${minAmount}`)
  if (maxAmount != null) conditions.push(sql`CAST(${expenses.amount} AS NUMERIC) <= ${maxAmount}`)

  // Fetch categories first (needed for name→id filter and display mapping)
  const cats = await db.select().from(categories).where(eq(categories.userId, userId))
  const catById = new Map(cats.map(c => [c.id, c]))

  // PERF FIX: category name→id filter pushed to SQL
  if (categoryFilter.length > 0) {
    const categorySet = new Set(categoryFilter.map((c: string) => c.toLowerCase()))
    const matchingIds = cats.filter(c => categorySet.has(c.name.toLowerCase())).map(c => c.id)
    if (matchingIds.length > 0) {
      conditions.push(inArray(expenses.categoryId, matchingIds))
    } else {
      // No matching category IDs found — return empty report
      conditions.push(sql`FALSE`)
    }
  }

  const expensesData = await db.select().from(expenses).where(and(...conditions))

  const rows = expensesData.map((e) => ({
    id: e.id,
    date: e.date ?? '',
    description: e.title || '',
    category: e.categoryId ? (catById.get(e.categoryId)?.name || 'Other') : 'Other',
    amount: typeof e.amount === 'number' ? e.amount : parseFloat(String(e.amount)) || 0,
    currency: currency.toUpperCase(),
  }))

  const formats = [
    formatPdf && 'pdf',
    formatCsv && 'csv',
    formatDocx && 'docx',
  ].filter(Boolean) as string[]

  if (formats.length === 0) {
    return NextResponse.json({ error: 'Select at least one format' }, { status: 400 })
  }

  const dateStr = new Date().toISOString().slice(0, 10)
  const title = `Custom Report ${dateStr}`

  try {
    if (formats.length === 1) {
      const fmt = formats[0]
      let buf: Buffer
      let contentType: string
      let ext: string

      if (fmt === 'pdf') {
        buf = await buildPdfBuffer({ title, rows })
        contentType = 'application/pdf'
        ext = 'pdf'
      } else if (fmt === 'csv') {
        buf = await buildCsvBuffer(rows)
        contentType = 'text/csv'
        ext = 'csv'
      } else {
        buf = await buildDocxBuffer({ title, rows })
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ext = 'docx'
      }

      return new Response(new Uint8Array(buf), {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="custom-report-${dateStr}.${ext}"`,
        },
      })
    }

    // Multiple formats → zip
    const zip = new JSZip()

    await Promise.all(
      formats.map(async (fmt) => {
        if (fmt === 'pdf') {
          const buf = await buildPdfBuffer({ title, rows })
          zip.file(`custom-report-${dateStr}.pdf`, buf)
        } else if (fmt === 'csv') {
          const buf = await buildCsvBuffer(rows)
          zip.file(`custom-report-${dateStr}.csv`, buf)
        } else if (fmt === 'docx') {
          const buf = await buildDocxBuffer({ title, rows })
          zip.file(`custom-report-${dateStr}.docx`, buf)
        }
      })
    )

    const zipBuf = await zip.generateAsync({ type: 'nodebuffer' })

    return new Response(new Uint8Array(zipBuf), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="custom-report-${dateStr}.zip"`,
      },
    })
  } catch (err) {
    console.error('[reports/custom] build error:', err)
    // SECURITY FIX: Don't expose internal error details to client
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    )
  }
}
