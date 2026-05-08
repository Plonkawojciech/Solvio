import { auth } from '@/lib/auth-compat'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { expenseApprovals, expenses, companyMembers } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'

// SECURITY (round 2 / A2): bound the approval-action body.
const ApprovalActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  notes: z.string().max(2000).optional().nullable(),
}).strict()

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const rawBody = await req.json().catch(() => null)
    if (!rawBody) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const parsed = ApprovalActionSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const body = parsed.data

    // Get current user's role
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

    // Only owner/admin/manager can approve/reject
    if (!['owner', 'admin', 'manager'].includes(role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Get the approval
    const approvalResult = await db.select()
      .from(expenseApprovals)
      .where(and(
        eq(expenseApprovals.id, id),
        eq(expenseApprovals.companyId, companyId),
      ))
      .limit(1)

    if (!approvalResult[0]) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 })
    }

    const approval = approvalResult[0]

    if (approval.status !== 'pending') {
      return NextResponse.json({ error: 'Approval already processed' }, { status: 400 })
    }

    // Cannot approve your own expenses (unless owner)
    if (approval.submittedBy === userId && role !== 'owner') {
      return NextResponse.json({ error: 'Cannot approve your own expenses' }, { status: 403 })
    }

    const newStatus = body.action === 'approve' ? 'approved' : 'rejected'

    // Update approval
    await db.update(expenseApprovals)
      .set({
        status: newStatus,
        reviewedBy: userId,
        reviewedAt: new Date(),
        notes: body.notes || null,
      })
      .where(eq(expenseApprovals.id, id))

    // SECURITY FIX: Defense-in-depth — add userId to UPDATE WHERE
    await db.update(expenses)
      .set({ approvalStatus: newStatus })
      .where(and(eq(expenses.id, approval.expenseId), eq(expenses.userId, approval.submittedBy)))

    return NextResponse.json({ success: true, status: newStatus })
  } catch (err) {
    console.error('[business/approvals/[id] PUT]', err)
    return NextResponse.json({ error: 'Failed to process approval' }, { status: 500 })
  }
}
