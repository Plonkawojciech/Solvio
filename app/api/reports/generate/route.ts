import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db, expenses, userSettings, categories } from '@/lib/db'
import { eq, gte, lte, and } from 'drizzle-orm'
import { buildCsvBuffer, buildPdfBuffer, buildDocxBuffer } from '@/lib/reports/builders'
import { put } from '@vercel/blob'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const type = formData.get('type') as 'yearly' | 'monthly'
  const year = formData.get('year') as string | null
  const ym = formData.get('ym') as string | null

  let startDate: string
  let endDate: string
  let periodKey: string
  let periodLabel: string

  if (type === 'yearly' && year) {
    startDate = `${year}-01-01`
    endDate = `${year}-12-31`
    periodKey = year
    periodLabel = `Yearly Report ${year}`
  } else if (type === 'monthly' && ym) {
    const [y, m] = ym.split('-')
    const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate()
    startDate = `${ym}-01`
    endDate = `${ym}-${String(lastDay).padStart(2, '0')}`
    periodKey = ym
    periodLabel = `Monthly Report ${ym}`
  } else {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  }

  // Fetch user settings for currency
  const settingsData = await db.select().from(userSettings)
    .where(eq(userSettings.userId, userId)).limit(1)
  const currency = (settingsData[0]?.currency || 'PLN').toUpperCase()

  // Fetch categories for join
  const cats = await db.select().from(categories).where(eq(categories.userId, userId))
  const catById = new Map(cats.map(c => [c.id, c]))

  // Fetch expenses
  const expensesData = await db.select().from(expenses)
    .where(and(
      eq(expenses.userId, userId),
      gte(expenses.date, startDate),
      lte(expenses.date, endDate)
    ))

  const rows = expensesData.map((e) => ({
    id: e.id,
    date: e.date ?? '',
    description: e.title || '',
    category: e.categoryId ? (catById.get(e.categoryId)?.name || 'Other') : 'Other',
    amount: typeof e.amount === 'number' ? e.amount : parseFloat(String(e.amount)) || 0,
    currency,
  }))

  const storagePath = `reports/${userId}/${periodKey}/${type === 'yearly' ? 'yearly' : 'monthly'}`

  try {
    const [csvBuf, pdfBuf, docxBuf] = await Promise.all([
      buildCsvBuffer(rows),
      buildPdfBuffer({ title: periodLabel, rows }),
      buildDocxBuffer({ title: periodLabel, rows }),
    ])

    const [csvBlob, pdfBlob, docxBlob] = await Promise.all([
      put(`${storagePath}.csv`, csvBuf, { access: 'public', contentType: 'text/csv' }),
      put(`${storagePath}.pdf`, pdfBuf, { access: 'public', contentType: 'application/pdf' }),
      put(`${storagePath}.docx`, docxBuf, { access: 'public', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
    ])

    return NextResponse.json({
      success: true,
      path: storagePath,
      urls: { csv: csvBlob.url, pdf: pdfBlob.url, docx: docxBlob.url },
    })
  } catch (err) {
    console.error('[reports/generate] build error:', err)
    return NextResponse.json(
      { error: 'Failed to generate report', details: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    )
  }
}
