import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { groups, groupMembers, expenseSplits } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

function normalizeMember(m: { id: string; displayName: string; email?: string | null; [key: string]: unknown }) {
  return { ...m, name: m.displayName }
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id } = await params
    const [group] = await db.select().from(groups).where(and(eq(groups.id, id), eq(groups.createdBy, userId)))
    if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, id))
    const splits = await db.select().from(expenseSplits).where(eq(expenseSplits.groupId, id))
    return NextResponse.json({ ...group, members: members.map(normalizeMember), splits })
  } catch (err) {
    console.error('[groups/:id GET]', err)
    return NextResponse.json({ error: 'Failed to fetch group' }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id } = await params
    await db.delete(groups).where(and(eq(groups.id, id), eq(groups.createdBy, userId)))
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[groups/:id DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete group' }, { status: 500 })
  }
}
