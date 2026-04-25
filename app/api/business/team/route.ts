import { auth } from '@/lib/auth-compat'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { companies, companyMembers, departments, expenses, userSettings } from '@/lib/db/schema'
import { eq, and, desc, sql, inArray } from 'drizzle-orm'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Verify business user
    const settings = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1)
    if (!settings[0] || settings[0].productType !== 'business') {
      return NextResponse.json({ error: 'Business account required' }, { status: 403 })
    }

    // Get user's company membership
    const memberResult = await db.select({
      companyId: companyMembers.companyId,
      role: companyMembers.role,
    })
      .from(companyMembers)
      .where(eq(companyMembers.userId, userId))
      .limit(1)

    if (!memberResult[0]) {
      return NextResponse.json({
        company: null,
        members: [],
        departments: [],
      })
    }

    const companyId = memberResult[0].companyId

    // Fetch company info
    const companyResult = await db.select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)

    // Fetch all members
    const members = await db.select()
      .from(companyMembers)
      .where(eq(companyMembers.companyId, companyId))
      .orderBy(desc(companyMembers.createdAt))

    // Fetch departments
    const depts = await db.select()
      .from(departments)
      .where(eq(departments.companyId, companyId))

    // Calculate spending per member (current month) — single GROUP BY query
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`

    const memberUserIds = members.map(m => m.userId).filter(Boolean)
    const spendingByUser = memberUserIds.length > 0
      ? await db.select({
          userId: expenses.userId,
          total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)::text`,
        })
          .from(expenses)
          .where(and(
            inArray(expenses.userId, memberUserIds),
            sql`${expenses.date} >= ${monthStart}`,
            sql`${expenses.date} <= ${monthEnd}`,
          ))
          .groupBy(expenses.userId)
      : []

    const spendingMap = new Map(spendingByUser.map(s => [s.userId, s.total]))

    const membersWithSpending = members.map((member) => {
      const dept = depts.find(d => d.id === member.departmentId)
      return {
        ...member,
        spendingUsed: spendingMap.get(member.userId) || '0',
        departmentName: dept?.name || null,
      }
    })

    return NextResponse.json({
      company: companyResult[0] || null,
      members: membersWithSpending,
      departments: depts,
      currentUserRole: memberResult[0].role,
    })
  } catch (err) {
    console.error('[business/team GET]', err)
    return NextResponse.json({ error: 'Failed to fetch team data' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()

    if (!body.email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 })
    }

    // Get user's company and verify role
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

    // Only owner/admin can invite
    if (!['owner', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Check for existing member with same email
    const existing = await db.select()
      .from(companyMembers)
      .where(and(
        eq(companyMembers.companyId, companyId),
        eq(companyMembers.email, body.email),
      ))
      .limit(1)

    if (existing[0]) {
      return NextResponse.json({ error: 'Member with this email already exists' }, { status: 409 })
    }

    // Create member (with pending status — in a real app, you'd send an invitation email)
    const [member] = await db.insert(companyMembers).values({
      companyId,
      userId: '', // Will be set when user accepts invitation
      role: body.role || 'employee',
      displayName: body.displayName || body.email.split('@')[0],
      email: body.email,
      departmentId: body.departmentId || null,
      spendingLimit: body.spendingLimit ? String(body.spendingLimit) : null,
      isActive: false, // Pending invitation
    }).returning()

    return NextResponse.json({ member })
  } catch (err) {
    console.error('[business/team POST]', err)
    return NextResponse.json({ error: 'Failed to invite member' }, { status: 500 })
  }
}
