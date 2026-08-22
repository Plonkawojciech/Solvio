import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** Publiczny puls — bez autoryzacji, żeby dało się monitorować z zewnątrz. */
export async function GET() {
  return NextResponse.json({ ok: true, service: 'solvio', api: 'v1' })
}
