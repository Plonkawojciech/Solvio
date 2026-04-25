import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { expenses, receipts, categories, categoryBudgets, userSettings, monthlyBudgets } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const [
      userExpenses,
      userReceipts,
      userCategories,
      userBudgets,
      userMonthlyBudgets,
      settings,
    ] = await Promise.all([
      db.select().from(expenses).where(eq(expenses.userId, userId)),
      db.select().from(receipts).where(eq(receipts.userId, userId)),
      db.select().from(categories).where(eq(categories.userId, userId)),
      db.select().from(categoryBudgets).where(eq(categoryBudgets.userId, userId)),
      db.select().from(monthlyBudgets).where(eq(monthlyBudgets.userId, userId)),
      db.select().from(userSettings).where(eq(userSettings.userId, userId)),
    ])

    const exportData = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      expenses: userExpenses,
      receipts: userReceipts.map(r => ({ ...r, rawOcr: undefined })), // exclude raw OCR data
      categories: userCategories,
      categoryBudgets: userBudgets,
      monthlyBudgets: userMonthlyBudgets,
      settings: settings[0] || null,
    }

    const json = JSON.stringify(exportData, null, 2)
    return new NextResponse(json, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="solvio-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    })
  } catch (err) {
    console.error('[export-data GET]', err)
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 })
  }
}
