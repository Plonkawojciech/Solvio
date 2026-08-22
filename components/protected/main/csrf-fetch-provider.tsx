'use client'

import { useEffect } from 'react'

const CSRF_HEADER = 'x-csrf-token'
const CSRF_BYPASS_PREFIXES = [
  '/api/auth/session',
  '/api/auth/demo',
  '/api/auth/magic-login',
  '/api/auth/csrf',
  '/api/cron/',
  '/api/settlement/',
  '/api/receipt/',
]
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

declare global {
  interface Window {
    __solvioCsrfFetchPatched?: boolean
  }
}

function readCookie(name: string) {
  const prefix = `${name}=`
  return document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length) ?? ''
}

function readCsrfCookie() {
  return readCookie('__Host-csrf') || readCookie('csrf')
}

function shouldAttachCsrf(url: URL, method: string) {
  if (url.origin !== window.location.origin) return false
  if (!url.pathname.startsWith('/api/')) return false
  if (SAFE_METHODS.has(method.toUpperCase())) return false
  return !CSRF_BYPASS_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
}

export function CsrfFetchProvider() {
  useEffect(() => {
    if (window.__solvioCsrfFetchPatched) return
    window.__solvioCsrfFetchPatched = true

    const originalFetch = window.fetch.bind(window)
    let tokenPromise: Promise<string> | null = null

    async function getToken() {
      const existing = readCsrfCookie()
      if (existing) return existing

      tokenPromise ??= originalFetch('/api/auth/csrf', {
        cache: 'no-store',
        credentials: 'same-origin',
      })
        .then((res) => res.json())
        .then((body) => String(body?.token || ''))
        .finally(() => {
          tokenPromise = null
        })

      return tokenPromise
    }

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : null
      const rawUrl = request?.url ?? String(input)
      const url = new URL(rawUrl, window.location.href)
      const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()

      if (!shouldAttachCsrf(url, method)) {
        return originalFetch(input, init)
      }

      const headers = new Headers(init?.headers ?? request?.headers)
      if (!headers.has(CSRF_HEADER)) {
        const token = await getToken()
        if (token) headers.set(CSRF_HEADER, token)
      }

      return originalFetch(input, {
        ...init,
        headers,
        credentials: init?.credentials ?? request?.credentials ?? 'same-origin',
      })
    }
  }, [])

  return null
}
