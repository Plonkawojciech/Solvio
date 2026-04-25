import { auth } from '@/lib/auth-compat'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { invoices, companyMembers, userSettings } from '@/lib/db/schema'
import { eq, and, desc, ilike, or, sql } from 'drizzle-orm'
import { z } from 'zod'

const CreateInvoiceSchema = z.object({
  invoiceNumber: z.string().max(100).optional().nullable(),
  vendorName: z.string().max(255).optional().nullable(),
  vendorNip: z.string().max(10).optional().nullable(),
  buyerName: z.string().max(255).optional().nullable(),
  buyerNip: z.string().max(10).optional().nullable(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  netAmount: z.number().nonnegative().optional().nullable(),
  vatAmount: z.number().nonnegative().optional().nullable(),
  grossAmount: z.number().nonnegative().optional().nullable(),
  vatRate: z.enum(['23%', '8%', '5%', '0%', 'zw']).optional().default('23%'),
  currency: z.string().length(3).optional().default('PLN'),
  deductibility: z.enum(['kup', 'nkup']).optional().default('kup'),
  splitPayment: z.boolean().optional().default(false),
  paymentMethod: z.enum(['transfer', 'cash', 'card']).optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  rawOcr: z.unknown().optional().nullable(),
  items: z.array(z.object({
    name: z.string().max(500),
    quantity: z.number().nonnegative(),
    unit: z.string().max(20),
    unitPrice: z.number().nonnegative(),
    netAmount: z.number().nonnegative(),
    vatRate: z.string().max(10),
    vatAmount: z.number().nonnegative(),
    grossAmount: z.number().nonnegative(),
  })).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
})

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
    const rawBody = await req.json().catch(() => null)
    if (!rawBody) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const parsed = CreateInvoiceSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }
    const body = parsed.data

    // Validate at least one identifying field
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
      invoiceNumber: body.invoiceNumber ?? null,
      vendorName: body.vendorName ?? null,
      vendorNip: body.vendorNip ?? null,
      buyerName: body.buyerName ?? null,
      buyerNip: body.buyerNip ?? null,
      issueDate: body.issueDate ?? null,
      dueDate: body.dueDate ?? null,
      paymentDate: body.paymentDate ?? null,
      netAmount: body.netAmount != null ? String(body.netAmount) : null,
      vatAmount: body.vatAmount != null ? String(body.vatAmount) : null,
      grossAmount: body.grossAmount != null ? String(body.grossAmount) : null,
      vatRate: body.vatRate,
      currency: body.currency,
      deductibility: body.deductibility,
      splitPayment: body.splitPayment,
      paymentMethod: body.paymentMethod ?? null,
      imageUrl: body.imageUrl ?? null,
      rawOcr: body.rawOcr ?? null,
      items: body.items ?? null,
      status: 'pending',
      submittedBy: userId,
      notes: body.notes ?? null,
    }).returning()

    return NextResponse.json({ invoice })
  } catch (err) {
    console.error('[business/invoices POST]', err)
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 })
  }
}
