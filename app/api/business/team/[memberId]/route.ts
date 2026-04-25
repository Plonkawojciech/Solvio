import { auth } from '@/lib/auth-compat'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { companyMembers } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'

// SECURITY FIX: Zod schema validation — role must be one of the allowed enum values
const TeamMemberUpdateSchema = z.object({
  role: z.enum(['admin', 'manager', 'employee']).optional(),
  displayName: z.string().min(1).max(100).optional(),
  departmentId: z.string().uuid().nullable().optional(),
  spendingLimit: z.union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d+)?$/)]).nullable().optional(),
  isActive: z.boolean().optional(),
}).strict()

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { memberId } = await params

  try {
    const rawBody = await req.json()
    const parsedBody = TeamMemberUpdateSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }
    const body = parsedBody.data

    // Get current user's role
    const currentMember = await db.select({
      companyId: companyMembers.companyId,
      role: companyMembers.role,
    })
      .from(companyMembers)
      .where(eq(companyMembers.userId, userId))
      .limit(1)

    if (!currentMember[0]) {
      return NextResponse.json({ error: 'No company found' }, { status: 400 })
    }

    const { companyId, role } = currentMember[0]

    // Only owner/admin can update members
    if (!['owner', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Verify target member belongs to same company
    const target = await db.select()
      .from(companyMembers)
      .where(and(
        eq(companyMembers.id, memberId),
        eq(companyMembers.companyId, companyId),
      ))
      .limit(1)

    if (!target[0]) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    // Cannot modify owner
    if (target[0].role === 'owner') {
      return NextResponse.json({ error: 'Cannot modify owner' }, { status: 403 })
    }

    // Build update object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {}
    if (body.role !== undefined) updateData.role = body.role
    if (body.displayName !== undefined) updateData.displayName = body.displayName
    if (body.departmentId !== undefined) updateData.departmentId = body.departmentId
    if (body.spendingLimit !== undefined) updateData.spendingLimit = body.spendingLimit ? String(body.spendingLimit) : null
    if (body.isActive !== undefined) updateData.isActive = body.isActive

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    await db.update(companyMembers)
      .set(updateData)
      .where(eq(companyMembers.id, memberId))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[business/team/[memberId] PUT]', err)
    return NextResponse.json({ error: 'Failed to update member' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { memberId } = await params

  try {
    // Get current user's role
    const currentMember = await db.select({
      companyId: companyMembers.companyId,
      role: companyMembers.role,
    })
      .from(companyMembers)
      .where(eq(companyMembers.userId, userId))
      .limit(1)

    if (!currentMember[0]) {
      return NextResponse.json({ error: 'No company found' }, { status: 400 })
    }

    const { companyId, role } = currentMember[0]

    // Only owner/admin can remove members
    if (!['owner', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Verify target member belongs to same company
    const target = await db.select()
      .from(companyMembers)
      .where(and(
        eq(companyMembers.id, memberId),
        eq(companyMembers.companyId, companyId),
      ))
      .limit(1)

    if (!target[0]) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    // Cannot remove owner
    if (target[0].role === 'owner') {
      return NextResponse.json({ error: 'Cannot remove owner' }, { status: 403 })
    }

    await db.delete(companyMembers)
      .where(eq(companyMembers.id, memberId))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[business/team/[memberId] DELETE]', err)
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
  }
}
