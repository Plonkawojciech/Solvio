import { auth } from '@/lib/auth-compat'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { expenseApprovals, expenses, companyMembers, categories, receipts, userSettings } from '@/lib/db/schema'
import { eq, and, desc } from 'drizzle-orm'

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

    // Enrich with expense details and submitter info
    const enrichedApprovals = await Promise.all(
      approvals.map(async (approval) => {
        // Get expense details
        const expenseResult = await db.select({
          title: expenses.title,
          amount: expenses.amount,
          date: expenses.date,
          vendor: expenses.vendor,
          categoryId: expenses.categoryId,
          receiptId: expenses.receiptId,
        })
          .from(expenses)
          .where(eq(expenses.id, approval.expenseId))
          .limit(1)

        const expense = expenseResult[0]

        // Get submitter info
        const submitterResult = await db.select({
          displayName: companyMembers.displayName,
          email: companyMembers.email,
        })
          .from(companyMembers)
          .where(and(
            eq(companyMembers.companyId, companyId),
            eq(companyMembers.userId, approval.submittedBy),
          ))
          .limit(1)

        // Get category name
        let categoryName: string | null = null
        if (expense?.categoryId) {
          const catResult = await db.select({ name: categories.name })
            .from(categories)
            .where(eq(categories.id, expense.categoryId))
            .limit(1)
          categoryName = catResult[0]?.name || null
        }

        // Get receipt image
        let receiptImageUrl: string | null = null
        if (expense?.receiptId) {
          const receiptResult = await db.select({ imageUrl: receipts.imageUrl })
            .from(receipts)
            .where(eq(receipts.id, expense.receiptId))
            .limit(1)
          receiptImageUrl = receiptResult[0]?.imageUrl || null
        }

        return {
          ...approval,
          submittedByName: submitterResult[0]?.displayName || null,
          submittedByEmail: submitterResult[0]?.email || null,
          expenseTitle: expense?.title || null,
          expenseAmount: expense?.amount || null,
          expenseDate: expense?.date || null,
          expenseVendor: expense?.vendor || null,
          expenseCategoryName: categoryName,
          receiptImageUrl,
        }
      })
    )

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

    // Update expense approval status
    await db.update(expenses)
      .set({ approvalStatus: 'pending' })
      .where(eq(expenses.id, body.expenseId))

    return NextResponse.json({ approval })
  } catch (err) {
    console.error('[business/approvals POST]', err)
    return NextResponse.json({ error: 'Failed to submit for approval' }, { status: 500 })
  }
}
