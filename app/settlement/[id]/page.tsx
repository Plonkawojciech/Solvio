import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { paymentRequests, groupMembers, groups } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { getSession } from '@/lib/session'
import { SettlementPageClient } from './client'

export const dynamic = 'force-dynamic'

const MEMBER_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6',
]

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ token?: string }>
}): Promise<Metadata> {
  const { id } = await params
  // SECURITY FIX: OG metadata must not expose amounts/names without token verification
  const { token } = await searchParams
  const [request] = await db.select().from(paymentRequests).where(eq(paymentRequests.id, id))
  if (!request) return { title: 'Payment request not found — Solvio' }

  // Only reveal details if token is valid OR the user is an authenticated group member
  const hasValidToken = request.shareToken ? token === request.shareToken : false
  if (!hasValidToken) {
    // Check if authenticated user is a group member
    const session = await getSession()
    let isMember = false
    if (session && request.groupId) {
      const members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, request.groupId))
      isMember = members.some((m) => m.userId === session.userId)
    }
    if (!isMember) {
      // Return generic metadata — do not leak financial data
      return {
        title: 'Payment request — Solvio',
        description: 'View your payment request on Solvio',
      }
    }
  }

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

  // SECURITY FIX: Move token check to server-side before ANY data is passed to client.
  // When shareToken is NULL, require session auth + group membership check.
  // Data is only passed to the client after access is verified.
  let hasValidToken = false
  if (request.shareToken) {
    // Public share-token path
    hasValidToken = token === request.shareToken
  } else {
    // No shareToken: require authenticated session + group membership
    const session = await getSession()
    if (session && request.groupId) {
      const memberRows = await db.select().from(groupMembers).where(eq(groupMembers.groupId, request.groupId))
      hasValidToken = memberRows.some((m) => m.userId === session.userId)
    }
  }

  // Fetch member and group data
  let group: typeof groups.$inferSelect | null = null
  let members: Array<typeof groupMembers.$inferSelect> = []

  if (request.groupId) {
    const [g] = await db.select().from(groups).where(eq(groups.id, request.groupId))
    group = g || null
    // Avoid a second DB round-trip if we already fetched members above
    if (members.length === 0) {
      members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, request.groupId))
    }
  }

  const fromMember = members.find((m) => m.id === request.fromMemberId)
  const toMember = members.find((m) => m.id === request.toMemberId)
  const fromIdx = members.findIndex((m) => m.id === request.fromMemberId)
  const toIdx = members.findIndex((m) => m.id === request.toMemberId)

  // Only pass sensitive fields to the client if access is verified
  const data = {
    id: request.id,
    fromName: hasValidToken ? (fromMember?.displayName ?? 'Unknown') : 'Unknown',
    fromColor: fromMember?.color || MEMBER_COLORS[fromIdx >= 0 ? fromIdx % MEMBER_COLORS.length : 0],
    toName: hasValidToken ? (toMember?.displayName ?? 'Unknown') : 'Unknown',
    toColor: toMember?.color || MEMBER_COLORS[toIdx >= 0 ? toIdx % MEMBER_COLORS.length : 0],
    amount: hasValidToken ? parseFloat(String(request.amount)) : 0,
    currency: request.currency,
    status: request.status,
    note: hasValidToken ? request.note : null,
    bankAccount: hasValidToken ? request.bankAccount : null,
    itemBreakdown: hasValidToken
      ? (request.itemBreakdown as Array<{
          itemName: string
          store: string
          date: string
          amount: number
          share: number
        }> | null)
      : null,
    settledAt: request.settledAt?.toISOString() ?? null,
    settledBy: request.settledBy,
    createdAt: request.createdAt.toISOString(),
    // Never pass shareToken to the client — it's only needed server-side
    shareToken: null as null,
    group: hasValidToken && group
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

  return <SettlementPageClient data={data} hasValidToken={hasValidToken} token={token || null} />
}
