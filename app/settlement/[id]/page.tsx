import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { paymentRequests, groupMembers, groups } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { SettlementPageClient } from './client'

export const dynamic = 'force-dynamic'

const MEMBER_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6',
]

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const [request] = await db.select().from(paymentRequests).where(eq(paymentRequests.id, id))
  if (!request) return { title: 'Payment request not found — Solvio' }

  let fromName = 'Someone'
  let toName = 'Someone'
  let groupName = ''

  const members = request.groupId
    ? await db.select().from(groupMembers).where(eq(groupMembers.groupId, request.groupId))
    : []

  const fromMember = members.find((m) => m.id === request.fromMemberId)
  const toMember = members.find((m) => m.id === request.toMemberId)
  if (fromMember) fromName = fromMember.displayName
  if (toMember) toName = toMember.displayName

  if (request.groupId) {
    const [group] = await db.select().from(groups).where(eq(groups.id, request.groupId))
    if (group) groupName = group.name
  }

  const amount = parseFloat(String(request.amount))
  const title = `${toName} requests ${amount.toFixed(2)} ${request.currency} from ${fromName}`
  const description = groupName
    ? `Payment request for "${groupName}" — Solvio`
    : 'Payment request — Solvio'

  return {
    title: `${title} — Solvio`,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'Solvio',
    },
  }
}

export default async function SettlementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { id } = await params
  const { token } = await searchParams

  const [request] = await db.select().from(paymentRequests).where(eq(paymentRequests.id, id))
  if (!request) notFound()

  // Fetch member and group data
  let group: typeof groups.$inferSelect | null = null
  let members: Array<typeof groupMembers.$inferSelect> = []

  if (request.groupId) {
    const [g] = await db.select().from(groups).where(eq(groups.id, request.groupId))
    group = g || null
    members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, request.groupId))
  }

  const fromMember = members.find((m) => m.id === request.fromMemberId)
  const toMember = members.find((m) => m.id === request.toMemberId)
  const fromIdx = members.findIndex((m) => m.id === request.fromMemberId)
  const toIdx = members.findIndex((m) => m.id === request.toMemberId)

  const data = {
    id: request.id,
    fromName: fromMember?.displayName ?? 'Unknown',
    fromColor: fromMember?.color || MEMBER_COLORS[fromIdx >= 0 ? fromIdx % MEMBER_COLORS.length : 0],
    toName: toMember?.displayName ?? 'Unknown',
    toColor: toMember?.color || MEMBER_COLORS[toIdx >= 0 ? toIdx % MEMBER_COLORS.length : 0],
    amount: parseFloat(String(request.amount)),
    currency: request.currency,
    status: request.status,
    note: request.note,
    bankAccount: request.bankAccount,
    itemBreakdown: request.itemBreakdown as Array<{
      itemName: string
      store: string
      date: string
      amount: number
      share: number
    }> | null,
    settledAt: request.settledAt?.toISOString() ?? null,
    settledBy: request.settledBy,
    createdAt: request.createdAt.toISOString(),
    shareToken: request.shareToken,
    group: group
      ? {
          name: group.name,
          emoji: group.emoji,
          currency: group.currency,
          mode: group.mode,
          startDate: group.startDate,
          endDate: group.endDate,
        }
      : null,
  }

  const hasValidToken = !request.shareToken || token === request.shareToken

  return <SettlementPageClient data={data} hasValidToken={hasValidToken} token={token || null} />
}
