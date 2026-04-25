import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { receipts, receiptItems } from '@/lib/db/schema'
import { eq, gte, desc, and, inArray } from 'drizzle-orm'

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const days = Math.min(parseInt(url.searchParams.get('days') || '90'), 365)
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().slice(0, 10)

  try {
    const userReceipts = await db.select({
      id: receipts.id,
      vendor: receipts.vendor,
      date: receipts.date,
      total: receipts.total,
      items: receipts.items,
    }).from(receipts)
      .where(and(eq(receipts.userId, userId), gte(receipts.date, sinceStr)))
      .orderBy(desc(receipts.date))

    // Top vendors by spend
    const vendorMap: Record<string, { total: number; count: number }> = {}
    for (const r of userReceipts) {
      const vendor = r.vendor || 'Unknown'
      const total = parseFloat(r.total || '0')
      if (!vendorMap[vendor]) vendorMap[vendor] = { total: 0, count: 0 }
      vendorMap[vendor].total += total
      vendorMap[vendor].count += 1
    }
    const topVendors = Object.entries(vendorMap)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10)
      .map(([name, { total, count }]) => ({
        name,
        total: parseFloat(total.toFixed(2)),
        count,
        avgSpend: parseFloat((total / count).toFixed(2)),
      }))

    // Most purchased items (from receipt_items table, batch with inArray)
    const receiptIds = userReceipts.map(r => r.id)
    let topItems: { name: string; count: number; avgPrice: number; totalSpend: number }[] = []
    if (receiptIds.length > 0) {
      // Fetch all items in one query (inArray handles up to ~65k values)
      const allItems = await db.select().from(receiptItems)
        .where(inArray(receiptItems.receiptId, receiptIds))

      const itemMap: Record<string, { count: number; totalPrice: number }> = {}
      for (const item of allItems) {
        const name = (item.name || '').toLowerCase().trim()
        if (!name || name.length < 2) continue
        const price = parseFloat(item.totalPrice || item.unitPrice || '0')
        if (!itemMap[name]) itemMap[name] = { count: 0, totalPrice: 0 }
        itemMap[name].count += 1
        itemMap[name].totalPrice += price
      }
      topItems = Object.entries(itemMap)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 20)
        .map(([name, { count, totalPrice }]) => ({
          name,
          count,
          avgPrice: count > 0 ? parseFloat((totalPrice / count).toFixed(2)) : 0,
          totalSpend: parseFloat(totalPrice.toFixed(2)),
        }))
    }

    // Also mine items from receipts.items JSONB (for receipts without receipt_items rows)
    const jsonbItemMap: Record<string, { count: number; totalPrice: number }> = {}
    for (const r of userReceipts) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = r.items as any[]
      if (!Array.isArray(items)) continue
      for (const item of items) {
        const name = (item.name || '').toLowerCase().trim()
        if (!name || name.length < 2) continue
        const price = parseFloat(item.price ?? item.totalPrice ?? item.unitPrice ?? 0)
        if (!jsonbItemMap[name]) jsonbItemMap[name] = { count: 0, totalPrice: 0 }
        jsonbItemMap[name].count += 1
        jsonbItemMap[name].totalPrice += price
      }
    }
    const jsonbItems = Object.entries(jsonbItemMap)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20)
      .map(([name, { count, totalPrice }]) => ({
        name,
        count,
        avgPrice: count > 0 ? parseFloat((totalPrice / count).toFixed(2)) : 0,
        totalSpend: parseFloat(totalPrice.toFixed(2)),
      }))

    // Merge topItems with jsonbItems (prefer higher count)
    const merged: Record<string, { count: number; totalSpend: number; avgPrice: number }> = {}
    for (const item of [...topItems, ...jsonbItems]) {
      if (!merged[item.name]) {
        merged[item.name] = { count: 0, totalSpend: 0, avgPrice: 0 }
      }
      merged[item.name].count += item.count
      merged[item.name].totalSpend += item.totalSpend
    }
    for (const key of Object.keys(merged)) {
      merged[key].avgPrice = merged[key].count > 0
        ? parseFloat((merged[key].totalSpend / merged[key].count).toFixed(2))
        : 0
    }
    const finalTopItems = Object.entries(merged)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 15)
      .map(([name, data]) => ({ name, ...data }))

    // Receipt frequency (receipts per week in the period)
    const weekMap: Record<string, number> = {}
    for (const r of userReceipts) {
      if (!r.date) continue
      const d = new Date(r.date)
      const weekStart = new Date(d)
      weekStart.setDate(d.getDate() - d.getDay()) // Sunday
      const weekKey = weekStart.toISOString().slice(0, 10)
      weekMap[weekKey] = (weekMap[weekKey] || 0) + 1
    }
    const receiptsByWeek = Object.entries(weekMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, count]) => ({ week, count }))

    // Total stats
    const totalSpend = userReceipts.reduce((s, r) => s + parseFloat(r.total || '0'), 0)
    const avgPerReceipt = userReceipts.length > 0 ? totalSpend / userReceipts.length : 0

    return NextResponse.json({
      period: { days, since: sinceStr },
      summary: {
        totalReceipts: userReceipts.length,
        totalSpend: parseFloat(totalSpend.toFixed(2)),
        avgPerReceipt: parseFloat(avgPerReceipt.toFixed(2)),
        uniqueVendors: Object.keys(vendorMap).length,
      },
      topVendors,
      topItems: finalTopItems,
      receiptsByWeek,
    })
  } catch (err) {
    console.error('[receipts/insights GET]', err)
    return NextResponse.json({ error: 'Failed to fetch receipt insights' }, { status: 500 })
  }
}
