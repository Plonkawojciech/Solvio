import { auth } from '@/lib/auth-compat'
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
    // SECURITY FIX: Don't expose internal error details to client
    return NextResponse.json(
      { error: 'Operation failed' },
      { status: 500 }
    )
  }
}
