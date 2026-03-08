import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

const CLERK_FAPI = 'https://growing-aphid-56.clerk.accounts.dev'
const CLERK_HOST = 'growing-aphid-56.clerk.accounts.dev'

async function proxy(req: NextRequest, path: string): Promise<NextResponse> {
  const url = new URL(req.url)
  const appHost = url.hostname
  const target = `${CLERK_FAPI}/${path}${url.search}`

  const headers = new Headers()
  req.headers.forEach((val, key) => {
    const lower = key.toLowerCase()
    if (!['host', 'connection', 'transfer-encoding', 'x-forwarded-for'].includes(lower)) {
      headers.set(key, val)
    }
  })
  headers.set('host', CLERK_HOST)
  headers.set('origin', `https://${appHost}`)

  const body = req.method !== 'GET' && req.method !== 'HEAD' ? req.body : null

  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body,
    redirect: 'manual', // Don't follow redirects — we forward them to the browser
    // @ts-ignore
    duplex: 'half',
  })

  const resHeaders = new Headers()
  upstream.headers.forEach((val, key) => {
    const lower = key.toLowerCase()
    if (lower === 'set-cookie') {
      // Strip domain so cookie is set on our domain instead of clerk's
      const rewritten = val.replace(/;\s*domain=[^;]+/gi, '').trim()
      resHeaders.append('set-cookie', rewritten)
    } else if (!['transfer-encoding', 'content-encoding'].includes(lower)) {
      resHeaders.set(key, val)
    }
  })

  // Forward redirects (3xx) directly to the browser
  if (upstream.status >= 300 && upstream.status < 400) {
    const location = upstream.headers.get('location')
    if (location) {
      return NextResponse.redirect(location, {
        status: upstream.status,
        headers: resHeaders,
      })
    }
  }

  const responseBody = await upstream.text()

  return new NextResponse(responseBody, {
    status: upstream.status,
    headers: resHeaders,
  })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params
  return proxy(req, path.join('/'))
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params
  return proxy(req, path.join('/'))
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params
  return proxy(req, path.join('/'))
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params
  return proxy(req, path.join('/'))
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params
  return proxy(req, path.join('/'))
}
