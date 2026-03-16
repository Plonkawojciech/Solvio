import { auth } from '@/lib/auth-compat'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { invoices, companies, companyMembers, userSettings } from '@/lib/db/schema'
import { eq, and, desc, ilike, or, sql } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const search = url.searchParams.get('search')
    const dateFrom = url.searchParams.get('dateFrom')
    const dateTo = url.searchParams.get('dateTo')

    // Get user's company
    const settings = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1)
    if (!settings[0] || settings[0].productType !== 'business') {
      return NextResponse.json({ error: 'Business account required' }, { status: 403 })
    }

    // Build conditions
    const conditions = [eq(invoices.userId, userId)]

    if (status && status !== 'all') {
      conditions.push(eq(invoices.status, status))
    }

    if (search) {
      conditions.push(
        or(
          ilike(invoices.invoiceNumber, `%${search}%`),
          ilike(invoices.vendorName, `%${search}%`),
          ilike(invoices.buyerName, `%${search}%`)
        )!
      )
    }

    if (dateFrom) {
      conditions.push(sql`${invoices.issueDate} >= ${dateFrom}`)
    }
    if (dateTo) {
      conditions.push(sql`${invoices.issueDate} <= ${dateTo}`)
    }

    const results = await db.select()
      .from(invoices)
      .where(and(...conditions))
      .orderBy(desc(invoices.createdAt))
      .limit(200)

    // Calculate KPIs
    const allInvoices = await db.select({
      status: invoices.status,
      grossAmount: invoices.grossAmount,
      dueDate: invoices.dueDate,
      issueDate: invoices.issueDate,
    })
      .from(invoices)
      .where(eq(invoices.userId, userId))

    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const totalInvoices = allInvoices.length
    const unpaidAmount = allInvoices
      .filter(i => i.status === 'pending' || i.status === 'approved')
      .reduce((sum, i) => sum + (parseFloat(i.grossAmount || '0')), 0)
    const overdueCount = allInvoices.filter(
      i => (i.status === 'pending' || i.status === 'approved') && i.dueDate && new Date(i.dueDate) < now
    ).length
    const thisMonthTotal = allInvoices
      .filter(i => i.issueDate?.startsWith(currentMonth))
      .reduce((sum, i) => sum + (parseFloat(i.grossAmount || '0')), 0)

    return NextResponse.json({
      invoices: results,
      kpi: {
        totalInvoices,
        unpaidAmount,
        overdueCount,
        thisMonthTotal,
      },
    })
  } catch (err) {
    console.error('[business/invoices GET]', err)
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()

    // Validate required fields
    if (!body.vendorName && !body.invoiceNumber) {
      return NextResponse.json({ error: 'Vendor name or invoice number required' }, { status: 400 })
    }

    // Get user's company
    const memberResult = await db.select({ companyId: companyMembers.companyId })
      .from(companyMembers)
      .where(eq(companyMembers.userId, userId))
      .limit(1)

    const companyId = memberResult[0]?.companyId || null

    const [invoice] = await db.insert(invoices).values({
      userId,
      companyId,
      invoiceNumber: body.invoiceNumber || null,
      vendorName: body.vendorName || null,
      vendorNip: body.vendorNip || null,
      buyerName: body.buyerName || null,
      buyerNip: body.buyerNip || null,
      issueDate: body.issueDate || null,
      dueDate: body.dueDate || null,
      paymentDate: body.paymentDate || null,
      netAmount: body.netAmount ? String(body.netAmount) : null,
      vatAmount: body.vatAmount ? String(body.vatAmount) : null,
      grossAmount: body.grossAmount ? String(body.grossAmount) : null,
      vatRate: body.vatRate || '23%',
      currency: body.currency || 'PLN',
      deductibility: body.deductibility || 'kup',
      splitPayment: body.splitPayment || false,
      paymentMethod: body.paymentMethod || 'transfer',
      imageUrl: body.imageUrl || null,
      rawOcr: body.rawOcr || null,
      items: body.items || null,
      status: 'pending',
      submittedBy: userId,
      notes: body.notes || null,
    }).returning()

    return NextResponse.json({ invoice })
  } catch (err) {
    console.error('[business/invoices POST]', err)
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 })
  }
}
