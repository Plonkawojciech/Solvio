import { auth } from '@/lib/auth-compat'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { expenseApprovals, expenses, companyMembers, categories, receipts, userSettings } from '@/lib/db/schema'
import { eq, and, desc, inArray } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const url = new URL(req.url)
    const status = url.searchParams.get('status') || 'pending'

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
      return NextResponse.json({ approvals: [], counts: { pending: 0, approved: 0, rejected: 0 } })
    }

    const { companyId, role } = memberResult[0]

    // Only owner/admin/manager can view approvals queue
    if (!['owner', 'admin', 'manager'].includes(role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Build conditions
    const conditions = [eq(expenseApprovals.companyId, companyId)]
    if (status && status !== 'all') {
      conditions.push(eq(expenseApprovals.status, status))
    }

    // Fetch approvals
    const approvals = await db.select()
      .from(expenseApprovals)
      .where(and(...conditions))
      .orderBy(desc(expenseApprovals.submittedAt))
      .limit(200)

    // Batch-fetch all related data to avoid N+1 queries
    const expenseIds = approvals.map(a => a.expenseId).filter(Boolean) as string[]
    const submitterUserIds = [...new Set(approvals.map(a => a.submittedBy).filter(Boolean) as string[])]

    // Single batch query for all expenses
    const expensesMap = new Map<string, {
      title: string | null
      amount: string
      date: string
      vendor: string | null
      categoryId: string | null
      receiptId: string | null
    }>()
    if (expenseIds.length > 0) {
      const expenseRows = await db.select({
        id: expenses.id,
        title: expenses.title,
        amount: expenses.amount,
        date: expenses.date,
        vendor: expenses.vendor,
        categoryId: expenses.categoryId,
        receiptId: expenses.receiptId,
      })
        .from(expenses)
        .where(inArray(expenses.id, expenseIds))
      for (const e of expenseRows) expensesMap.set(e.id, e)
    }

    // Single batch query for all submitters
    const membersMap = new Map<string, { displayName: string | null; email: string | null }>()
    if (submitterUserIds.length > 0) {
      const memberRows = await db.select({
        userId: companyMembers.userId,
        displayName: companyMembers.displayName,
        email: companyMembers.email,
      })
        .from(companyMembers)
        .where(and(
          eq(companyMembers.companyId, companyId),
          inArray(companyMembers.userId, submitterUserIds),
        ))
      for (const m of memberRows) membersMap.set(m.userId, m)
    }

    // Collect unique categoryIds and receiptIds from the fetched expenses
    const categoryIds = [...new Set(
      [...expensesMap.values()].map(e => e.categoryId).filter(Boolean) as string[]
    )]
    const receiptIds = [...new Set(
      [...expensesMap.values()].map(e => e.receiptId).filter(Boolean) as string[]
    )]

    // Single batch query for categories
    const categoriesMap = new Map<string, string>()
    if (categoryIds.length > 0) {
      const catRows = await db.select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(inArray(categories.id, categoryIds))
      for (const c of catRows) categoriesMap.set(c.id, c.name)
    }

    // Single batch query for receipt images
    const receiptsMap = new Map<string, string | null>()
    if (receiptIds.length > 0) {
      const receiptRows = await db.select({ id: receipts.id, imageUrl: receipts.imageUrl })
        .from(receipts)
        .where(inArray(receipts.id, receiptIds))
      for (const r of receiptRows) receiptsMap.set(r.id, r.imageUrl)
    }

    // Map results in JS — no more per-approval DB queries
    const enrichedApprovals = approvals.map((approval) => {
      const expense = expensesMap.get(approval.expenseId)
      const submitter = membersMap.get(approval.submittedBy)
      const categoryName = expense?.categoryId ? (categoriesMap.get(expense.categoryId) ?? null) : null
      const receiptImageUrl = expense?.receiptId ? (receiptsMap.get(expense.receiptId) ?? null) : null

      return {
        ...approval,
        submittedByName: submitter?.displayName || null,
        submittedByEmail: submitter?.email || null,
        expenseTitle: expense?.title || null,
        expenseAmount: expense?.amount || null,
        expenseDate: expense?.date || null,
        expenseVendor: expense?.vendor || null,
        expenseCategoryName: categoryName,
        receiptImageUrl,
      }
    })

    // Get counts for all statuses
    const allApprovals = await db.select({ status: expenseApprovals.status })
      .from(expenseApprovals)
      .where(eq(expenseApprovals.companyId, companyId))

    const counts = {
      pending: allApprovals.filter(a => a.status === 'pending').length,
      approved: allApprovals.filter(a => a.status === 'approved').length,
      rejected: allApprovals.filter(a => a.status === 'rejected').length,
    }

    return NextResponse.json({
      approvals: enrichedApprovals,
      counts,
    })
  } catch (err) {
    console.error('[business/approvals GET]', err)
    return NextResponse.json({ error: 'Failed to fetch approvals' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()

    if (!body.expenseId) {
      return NextResponse.json({ error: 'expenseId required' }, { status: 400 })
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(body.expenseId)) {
      return NextResponse.json({ error: 'Invalid expenseId format' }, { status: 400 })
    }

    // Get user's company
    const memberResult = await db.select({ companyId: companyMembers.companyId })
      .from(companyMembers)
      .where(eq(companyMembers.userId, userId))
      .limit(1)

    const companyId = memberResult[0]?.companyId || null

    // Verify expense belongs to user
    const expenseResult = await db.select()
      .from(expenses)
      .where(and(
        eq(expenses.id, body.expenseId),
        eq(expenses.userId, userId),
      ))
      .limit(1)

    if (!expenseResult[0]) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    // Create approval request
    const [approval] = await db.insert(expenseApprovals).values({
      companyId,
      expenseId: body.expenseId,
      submittedBy: userId,
      status: 'pending',
      notes: body.notes || null,
    }).returning()

    // SECURITY FIX: Defense-in-depth — add userId to UPDATE WHERE
    await db.update(expenses)
      .set({ approvalStatus: 'pending' })
      .where(and(eq(expenses.id, body.expenseId), eq(expenses.userId, userId)))

    return NextResponse.json({ approval })
  } catch (err) {
    console.error('[business/approvals POST]', err)
    return NextResponse.json({ error: 'Failed to submit for approval' }, { status: 500 })
  }
}
