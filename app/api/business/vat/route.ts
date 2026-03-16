import { auth } from '@/lib/auth-compat'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { vatEntries, companies, companyMembers, userSettings } from '@/lib/db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'

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

    // Get last 12 months data for the chart
    const now = new Date()
    const monthlyData = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthPeriod = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

      const monthEntries = await db.select({
        type: vatEntries.type,
        vatAmount: vatEntries.vatAmount,
      })
        .from(vatEntries)
        .where(and(
          eq(vatEntries.companyId, companyId),
          eq(vatEntries.period, monthPeriod),
        ))

      const monthInput = monthEntries
        .filter(e => e.type === 'input')
        .reduce((sum, e) => sum + (parseFloat(e.vatAmount) || 0), 0)
      const monthOutput = monthEntries
        .filter(e => e.type === 'output')
        .reduce((sum, e) => sum + (parseFloat(e.vatAmount) || 0), 0)

      monthlyData.push({
        period: monthPeriod,
        label: d.toLocaleDateString('pl-PL', { month: 'short', year: '2-digit' }),
        input: monthInput,
        output: monthOutput,
        balance: monthOutput - monthInput,
      })
    }

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
    const body = await req.json()

    // Validate required fields
    if (!body.type || !body.netAmount || !body.vatAmount || !body.vatRate || !body.period) {
      return NextResponse.json({ error: 'Missing required fields: type, netAmount, vatAmount, vatRate, period' }, { status: 400 })
    }

    if (!['input', 'output'].includes(body.type)) {
      return NextResponse.json({ error: 'type must be "input" or "output"' }, { status: 400 })
    }

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
      invoiceId: body.invoiceId || null,
      type: body.type,
      period: body.period,
      netAmount: String(body.netAmount),
      vatAmount: String(body.vatAmount),
      vatRate: body.vatRate,
      counterpartyName: body.counterpartyName || null,
      counterpartyNip: body.counterpartyNip || null,
      documentNumber: body.documentNumber || null,
      documentDate: body.documentDate || null,
      deductible: body.deductible !== false,
    }).returning()

    return NextResponse.json({ entry })
  } catch (err) {
    console.error('[business/vat POST]', err)
    return NextResponse.json({ error: 'Failed to create VAT entry' }, { status: 500 })
  }
}
