import { handleCreate, handleList } from '@/lib/receipts/handlers'

export const dynamic = 'force-dynamic'

export const GET = handleList
export const POST = handleCreate
