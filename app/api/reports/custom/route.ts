import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, expenses, categories } from '@/lib/db'
import { eq, gte, lte, and } from 'drizzle-orm'
import { buildCsvBuffer, buildPdfBuffer, buildDocxBuffer } from '@/lib/reports/builders'
import JSZip from 'jszip'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    dateFrom,
    dateTo,
    minAmount,
    maxAmount,
    categories: categoryFilter = [],
    formatPdf,
    formatCsv,
    formatDocx,
    currency = 'PLN',
  } = body

  // Build query conditions
  const conditions = [eq(expenses.userId, userId)]
  if (dateFrom) conditions.push(gte(expenses.date, dateFrom))
  if (dateTo) conditions.push(lte(expenses.date, dateTo))

  const expensesData = await db.select().from(expenses)
    .where(and(...conditions))

  // Fetch categories for join
  const cats = await db.select().from(categories).where(eq(categories.userId, userId))
  const catById = new Map(cats.map(c => [c.id, c]))

  let rows = expensesData
    .filter(e => {
      const amt = Number(e.amount || 0)
      if (minAmount && amt < parseFloat(minAmount)) return false
      if (maxAmount && amt > parseFloat(maxAmount)) return false
      return true
    })
    .map((e) => ({
      id: e.id,
      date: e.date ?? '',
      description: e.title || '',
      category: e.categoryId ? (catById.get(e.categoryId)?.name || 'Other') : 'Other',
      amount: typeof e.amount === 'number' ? e.amount : parseFloat(String(e.amount)) || 0,
      currency: currency.toUpperCase(),
    }))

  // Filter by categories client-side (if categories filter provided)
  if (categoryFilter.length > 0) {
    const categorySet = new Set(categoryFilter.map((c: string) => c.toLowerCase()))
    rows = rows.filter((r) => categorySet.has(r.category.toLowerCase()))
  }

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
    return NextResponse.json(
      { error: 'Failed to generate report', details: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    )
  }
}
