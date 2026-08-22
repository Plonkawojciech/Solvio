import { handleDelete, handleGet, handleUpdate } from '@/lib/receipts/handlers'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Ctx) {
  return handleGet(req, (await params).id)
}

export async function PATCH(req: Request, { params }: Ctx) {
  return handleUpdate(req, (await params).id)
}

export async function DELETE(req: Request, { params }: Ctx) {
  return handleDelete(req, (await params).id)
}
