import { auth } from '@/lib/auth-compat'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { groups, groupMembers, expenseSplits, receipts } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import OpenAI from 'openai'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  try {
    const { id } = await params

    // Verify group ownership
    const [group] = await db.select().from(groups).where(and(eq(groups.id, id), eq(groups.createdBy, userId)))
    if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Fetch group data
    const [members, splits, groupReceipts] = await Promise.all([
      db.select().from(groupMembers).where(eq(groupMembers.groupId, id)),
      db.select().from(expenseSplits).where(eq(expenseSplits.groupId, id)),
      db.select().from(receipts).where(eq(receipts.groupId, id)),
    ])

    if (splits.length === 0 && groupReceipts.length === 0) {
      return NextResponse.json({ insights: [], summary: '' })
    }

    // Aggregate spending data per member
    const memberSpending: Record<string, { paid: number; consumed: number; name: string }> = {}
    for (const m of members) {
      memberSpending[m.id] = { paid: 0, consumed: 0, name: m.displayName }
    }

    for (const split of splits) {
      const portions = Array.isArray(split.splits) ? split.splits : []
      if (memberSpending[split.paidByMemberId]) {
        memberSpending[split.paidByMemberId].paid += parseFloat(String(split.totalAmount)) || 0
      }
      for (const portion of portions as Array<{ memberId: string; amount: number }>) {
        if (memberSpending[portion.memberId]) {
          memberSpending[portion.memberId].consumed += portion.amount || 0
        }
      }
    }

    // Receipt vendor analysis
    const vendors: Record<string, number> = {}
    let totalReceiptAmount = 0
    for (const r of groupReceipts) {
      const amt = parseFloat(String(r.total)) || 0
      totalReceiptAmount += amt
      if (r.vendor) {
        vendors[r.vendor] = (vendors[r.vendor] || 0) + amt
      }
    }

    const totalGroupSpend = splits.reduce((s, sp) => s + (parseFloat(String(sp.totalAmount)) || 0), 0)
    const memberCount = members.length
    const avgPerPerson = memberCount > 0 ? totalGroupSpend / memberCount : 0

    // Find unsettled amounts
    let unsettledTotal = 0
    let unsettledCount = 0
    for (const split of splits) {
      const portions = Array.isArray(split.splits) ? split.splits : []
      for (const portion of portions as Array<{ memberId: string; amount: number; settled: boolean }>) {
        if (!portion.settled && portion.memberId !== split.paidByMemberId) {
          unsettledTotal += portion.amount || 0
          unsettledCount++
        }
      }
    }

    const lang = 'pl' // Default to Polish for now, can be parameterized
    const isPolish = lang === 'pl'
    const langInstruction = isPolish
      ? 'Odpowiadaj WYŁĄCZNIE po polsku. Bądź konkretny i podaj praktyczne wskazówki.'
      : 'Respond ONLY in English. Be specific and give practical tips.'

    const prompt = `You are a group expense analyst. Analyze this group's spending and provide useful insights.

${langInstruction}

GROUP DATA:
- Group name: "${group.name}" (${group.mode} mode)
- Members: ${members.map(m => m.displayName).join(', ')}
- Total group spend: ${totalGroupSpend.toFixed(2)} ${group.currency}
- Average per person: ${avgPerPerson.toFixed(2)} ${group.currency}
- Number of splits: ${splits.length}
- Number of receipts: ${groupReceipts.length}
- Unsettled debts: ${unsettledCount} totaling ${unsettledTotal.toFixed(2)} ${group.currency}
- Spending by member: ${JSON.stringify(Object.values(memberSpending).map(m => ({ name: m.name, paid: m.paid.toFixed(2), consumed: m.consumed.toFixed(2) })))}
- Top vendors: ${JSON.stringify(Object.entries(vendors).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([v, a]) => ({ vendor: v, amount: a.toFixed(2) })))}

Return ONLY valid JSON (no markdown):
{
  "insights": [
    { "type": "spending|balance|tip|warning", "icon": "emoji", "title": "short title", "description": "1-2 sentence insight", "priority": "high|medium|low" }
  ],
  "summary": "1 sentence overall group health"
}

Provide 3-5 insights. Focus on:
- Who pays most often and suggest rotation
- Spending trends and comparisons
- Unsettled debt reminders
- Practical money-saving tips (specific to Polish stores if vendor names suggest it)
- Daily/weekly spending averages if applicable`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0]?.message?.content || '{}'
    const parsed = JSON.parse(raw)

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('[groups/:id/ai-insights] error:', err)
    return NextResponse.json({ insights: [], summary: '', error: 'Failed to generate insights' }, { status: 500 })
  }
}
