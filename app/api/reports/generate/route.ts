import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db, expenses, userSettings, categories, reports } from '@/lib/db'
import { eq, gte, lte, and } from 'drizzle-orm'
import { buildCsvBuffer, buildPdfBuffer, buildDocxBuffer } from '@/lib/reports/builders'
import { put } from '@vercel/blob'
import { rateLimitPersistent } from '@/lib/rate-limit'
import { withApiTiming } from '@/lib/api-timing'
import { z } from 'zod'

const MAX_REPORT_ROWS = 5_000

const ReportFormDataSchema = z.union([
  z.object({
    type: z.literal('yearly'),
    year: z.string().regex(/^\d{4}$/, 'year must be a 4-digit year'),
    ym: z.string().optional().nullable(),
  }),
  z.object({
    type: z.literal('monthly'),
    ym: z.string().regex(/^\d{4}-\d{2}$/, 'ym must be YYYY-MM'),
    year: z.string().optional().nullable(),
  }),
])

async function postGenerateReport(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await rateLimitPersistent(`reports:generate:${userId}`, { maxRequests: 10, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many report generation requests. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  const formData = await request.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  const rawType = formData.get('type')
  const year = formData.get('year') as string | null
  const ym = formData.get('ym') as string | null

  const parsedForm = ReportFormDataSchema.safeParse({ type: rawType, year, ym })
  if (!parsedForm.success) {
    return NextResponse.json({ error: 'Invalid parameters', details: parsedForm.error.flatten().fieldErrors }, { status: 400 })
  }

  const type = parsedForm.data.type

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

  // PERF FIX: parallel execution with Promise.all
  // Fetch user settings, categories, and expenses concurrently
  const [settingsData, cats, expensesData] = await Promise.all([
    db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
    db.select().from(categories).where(eq(categories.userId, userId)),
    db.select().from(expenses).where(and(
      eq(expenses.userId, userId),
      gte(expenses.date, startDate),
      lte(expenses.date, endDate)
    )).limit(MAX_REPORT_ROWS + 1),
  ])

  if (expensesData.length > MAX_REPORT_ROWS) {
    return NextResponse.json(
      { error: 'Report too large. Narrow the date range and try again.', limit: MAX_REPORT_ROWS },
      { status: 413 },
    )
  }
  const currency = (settingsData[0]?.currency || 'PLN').toUpperCase()
  const catById = new Map(cats.map(c => [c.id, c]))

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

    // Round-3 (A1): backfill `reports` table that schema.ts:117 defined but
    // this route never wrote to. The defect was flagged by A4 R2 — the
    // demo-reset sweeper deletes any reports rows on logout, so the table
    // was effectively dead schema. We INSERT one row per blob so a future
    // server-side reports list page (or an iOS history screen) has data.
    // Errors are swallowed because the blob upload already succeeded —
    // failing the whole response over a tracking insert would be a
    // regression for a feature that was previously already broken.
    try {
      await db.insert(reports).values([
        {
          userId,
          type,
          periodStart: startDate,
          periodEnd: endDate,
          format: 'csv',
          fileUrl: csvBlob.url,
          metadata: { periodKey, periodLabel, rowCount: rows.length, currency },
        },
        {
          userId,
          type,
          periodStart: startDate,
          periodEnd: endDate,
          format: 'pdf',
          fileUrl: pdfBlob.url,
          metadata: { periodKey, periodLabel, rowCount: rows.length, currency },
        },
        {
          userId,
          type,
          periodStart: startDate,
          periodEnd: endDate,
          format: 'docx',
          fileUrl: docxBlob.url,
          metadata: { periodKey, periodLabel, rowCount: rows.length, currency },
        },
      ])
    } catch (insertErr) {
      // Non-fatal: report files exist on Blob, just not tracked in DB.
      console.warn('[reports/generate] reports table insert failed (non-fatal):', insertErr)
    }

    return NextResponse.json({
      success: true,
      path: storagePath,
      urls: { csv: csvBlob.url, pdf: pdfBlob.url, docx: docxBlob.url },
    }, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (err) {
    console.error('[reports/generate] build error:', err)
    // SECURITY FIX: Don't expose internal error details to client
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    )
  }
}

export const POST = withApiTiming('api.reports.generate.POST', postGenerateReport)
