import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { ensureUserSeeded } from '@/lib/db/seed-user'

export async function POST() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await ensureUserSeeded(userId)

    return NextResponse.json({
      message: 'Categories seeded successfully',
    })

  } catch (error) {
    console.error('[Seed Categories] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Unexpected error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
