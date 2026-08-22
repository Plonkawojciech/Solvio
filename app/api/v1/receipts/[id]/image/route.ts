import { receiptImageResponse } from '@/lib/receipts/image-response'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return receiptImageResponse(req, id)
}
