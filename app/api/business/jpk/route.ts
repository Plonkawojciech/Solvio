import { auth } from '@/lib/auth-compat'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { vatEntries, companies, companyMembers, userSettings } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { buildJpkV7M } from '@/lib/reports/jpk-builder'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()

    if (!body.period || !/^\d{4}-\d{2}$/.test(body.period)) {
      return NextResponse.json({ error: 'period must be in YYYY-MM format' }, { status: 400 })
    }

    // Verify business user
    const settings = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1)
    if (!settings[0] || settings[0].productType !== 'business') {
      return NextResponse.json({ error: 'Business account required' }, { status: 403 })
    }

    // Get user's company
    const memberResult = await db.select({
      companyId: companyMembers.companyId,
      role: companyMembers.role,
    })
      .from(companyMembers)
      .where(eq(companyMembers.userId, userId))
      .limit(1)

    if (!memberResult[0]) {
      return NextResponse.json({ error: 'No company found' }, { status: 400 })
    }

    const { companyId, role } = memberResult[0]

    // Only owner/admin can generate JPK
    if (!['owner', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Get company info
    const companyResult = await db.select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)

    if (!companyResult[0]) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const company = companyResult[0]

    if (!company.nip) {
      return NextResponse.json({ error: 'Company NIP required to generate JPK' }, { status: 400 })
    }

    // Get VAT entries for the period
    const entries = await db.select()
      .from(vatEntries)
      .where(and(
        eq(vatEntries.companyId, companyId),
        eq(vatEntries.period, body.period),
      ))

    // Generate JPK XML
    const xml = buildJpkV7M(
      {
        nip: company.nip,
        name: company.name,
        postalCode: company.postalCode || undefined,
        city: company.city || undefined,
      },
      entries.map(e => ({
        id: e.id,
        type: e.type as 'input' | 'output',
        documentNumber: e.documentNumber,
        documentDate: e.documentDate,
        counterpartyName: e.counterpartyName,
        counterpartyNip: e.counterpartyNip,
        netAmount: e.netAmount,
        vatAmount: e.vatAmount,
        vatRate: e.vatRate,
        deductible: e.deductible ?? true,
        period: e.period,
      })),
      body.period
    )

    // Return as downloadable XML
    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
        'Content-Disposition': `attachment; filename="JPK_V7M_${company.nip}_${body.period}.xml"`,
      },
    })
  } catch (err) {
    console.error('[business/jpk POST]', err)
    return NextResponse.json({ error: 'Failed to generate JPK' }, { status: 500 })
  }
}
