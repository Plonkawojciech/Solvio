import { auth } from '@/lib/auth-compat'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { vatEntries, companyMembers, userSettings } from '@/lib/db/schema'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { z } from 'zod'

const CreateVatEntrySchema = z.object({
  type: z.enum(['input', 'output']),
  netAmount: z.number().nonnegative(),
  vatAmount: z.number().nonnegative(),
  vatRate: z.enum(['23%', '8%', '5%', '0%', 'zw']),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'period must be YYYY-MM'),
  invoiceId: z.string().uuid().optional().nullable(),
  counterpartyName: z.string().max(255).optional().nullable(),
  counterpartyNip: z.string().max(10).optional().nullable(),
  documentNumber: z.string().max(100).optional().nullable(),
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  deductible: z.boolean().optional().default(true),
})

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const url = new URL(req.url)
    const period = url.searchParams.get('period')

    // Verify business user
    const settings = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1)
    if (!settings[0] || settings[0].productType !== 'business') {
      return NextResponse.json({ error: 'Business account required' }, { status: 403 })
    }

    // Get user's company
    const memberResult = await db.select({ companyId: companyMembers.companyId })
      .from(companyMembers)
      .where(eq(companyMembers.userId, userId))
      .limit(1)

    const companyId = memberResult[0]?.companyId

    if (!companyId) {
      return NextResponse.json({
        entries: { input: [], output: [] },
        summary: { vatInput: 0, vatOutput: 0, balance: 0 },
        monthly: [],
      })
    }

    // Get entries for the requested period
    const conditions = [eq(vatEntries.companyId, companyId)]
    if (period) {
      conditions.push(eq(vatEntries.period, period))
    }

    const entries = await db.select()
      .from(vatEntries)
      .where(and(...conditions))
      .orderBy(desc(vatEntries.documentDate))

    const inputEntries = entries.filter(e => e.type === 'input')
    const outputEntries = entries.filter(e => e.type === 'output')

    const vatInput = inputEntries.reduce((sum, e) => sum + (parseFloat(e.vatAmount) || 0), 0)
    const vatOutput = outputEntries.reduce((sum, e) => sum + (parseFloat(e.vatAmount) || 0), 0)

    // PERF FIX: Get last 12 months data for the chart in ONE query (was N+1: 12 separate queries)
    const now = new Date()
    const monthMeta: Array<{ period: string; label: string }> = []
    const last12Periods: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthPeriod = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      last12Periods.push(monthPeriod)
      monthMeta.push({
        period: monthPeriod,
        label: d.toLocaleDateString('pl-PL', { month: 'short', year: '2-digit' }),
      })
    }

    // Single query for all 12 months — replaces 12 sequential awaits
    const allMonthlyEntries = await db.select({
      type: vatEntries.type,
      vatAmount: vatEntries.vatAmount,
      period: vatEntries.period,
    })
      .from(vatEntries)
      .where(and(
        eq(vatEntries.companyId, companyId),
        inArray(vatEntries.period, last12Periods),
      ))

    // Aggregate in-memory by period
    const periodMap = new Map<string, { input: number; output: number }>()
    for (const e of allMonthlyEntries) {
      if (!periodMap.has(e.period)) periodMap.set(e.period, { input: 0, output: 0 })
      const bucket = periodMap.get(e.period)!
      const amount = parseFloat(e.vatAmount) || 0
      if (e.type === 'input') bucket.input += amount
      else if (e.type === 'output') bucket.output += amount
    }

    const monthlyData = monthMeta.map(({ period, label }) => {
      const bucket = periodMap.get(period) ?? { input: 0, output: 0 }
      return {
        period,
        label,
        input: bucket.input,
        output: bucket.output,
        balance: bucket.output - bucket.input,
      }
    })

    return NextResponse.json({
      entries: {
        input: inputEntries,
        output: outputEntries,
      },
      summary: {
        vatInput,
        vatOutput,
        balance: vatOutput - vatInput,
      },
      monthly: monthlyData,
    })
  } catch (err) {
    console.error('[business/vat GET]', err)
    return NextResponse.json({ error: 'Failed to fetch VAT data' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const rawBody = await req.json().catch(() => null)
    if (!rawBody) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const parsed = CreateVatEntrySchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }
    const body = parsed.data

    // Get user's company
    const memberResult = await db.select({ companyId: companyMembers.companyId })
      .from(companyMembers)
      .where(eq(companyMembers.userId, userId))
      .limit(1)

    if (!memberResult[0]?.companyId) {
      return NextResponse.json({ error: 'No company found' }, { status: 400 })
    }

    const [entry] = await db.insert(vatEntries).values({
      companyId: memberResult[0].companyId,
      userId,
      invoiceId: body.invoiceId ?? null,
      type: body.type,
      period: body.period,
      netAmount: String(body.netAmount),
      vatAmount: String(body.vatAmount),
      vatRate: body.vatRate,
      counterpartyName: body.counterpartyName ?? null,
      counterpartyNip: body.counterpartyNip ?? null,
      documentNumber: body.documentNumber ?? null,
      documentDate: body.documentDate ?? null,
      deductible: body.deductible,
    }).returning()

    return NextResponse.json({ entry })
  } catch (err) {
    console.error('[business/vat POST]', err)
    return NextResponse.json({ error: 'Failed to create VAT entry' }, { status: 500 })
  }
}
