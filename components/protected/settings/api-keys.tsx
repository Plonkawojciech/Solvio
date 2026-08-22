'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, KeyRound, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

interface ApiKeyView {
  id: string
  name: string
  prefix: string
  scope: 'READ' | 'WRITE'
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

/** Klucze, którymi crm.programo.pl czyta finanse z Solvio. Jawny sekret
 *  pokazujemy raz, zaraz po utworzeniu — potem nie ma go już nigdzie. */
export function ApiKeys() {
  const [keys, setKeys] = useState<ApiKeyView[]>([])
  const [name, setName] = useState('')
  const [scope, setScope] = useState<'READ' | 'WRITE'>('READ')
  const [fresh, setFresh] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/keys')
    if (!res.ok) return
    const data = await res.json()
    setKeys(data.keys ?? [])
  }, [])

  useEffect(() => { void load() }, [load])

  async function create() {
    if (!name.trim()) {
      toast.error('Podaj nazwę klucza')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), scope }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Nie udało się utworzyć klucza')
        return
      }
      setFresh(data.key.plaintext)
      setName('')
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/keys/${id}`, { method: 'DELETE' })
    await load()
    toast.success('Klucz unieważniony')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          Klucze API
        </CardTitle>
        <CardDescription>
          Nagłówek <code className="font-mono text-xs">X-Api-Key</code> na
          <code className="font-mono text-xs"> /api/v1/*</code>. READ czyta, WRITE zapisuje.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {fresh && (
          <div className="rounded-lg border border-primary/40 bg-secondary p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-secondary-foreground">
              Skopiuj teraz — drugi raz go nie zobaczysz
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate font-mono text-xs">{fresh}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(fresh)
                  toast.success('Skopiowano')
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Input
            className="flex-1 min-w-48"
            placeholder="np. CRM Finanse"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={scope}
            onChange={(e) => setScope(e.target.value as 'READ' | 'WRITE')}
          >
            <option value="READ">READ</option>
            <option value="WRITE">WRITE</option>
          </select>
          <Button onClick={create} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Wystaw
          </Button>
        </div>

        <div className="divide-y divide-border">
          {keys.length === 0 && (
            <p className="py-3 text-sm text-muted-foreground">Nie ma jeszcze żadnego klucza.</p>
          )}
          {keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {k.name}
                  {k.revokedAt && <span className="ml-2 text-xs text-destructive">unieważniony</span>}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  slvk_{k.prefix}… · {k.scope} ·{' '}
                  {k.lastUsedAt
                    ? `użyty ${new Date(k.lastUsedAt).toLocaleDateString('pl-PL')}`
                    : 'nieużywany'}
                </p>
              </div>
              {!k.revokedAt && (
                <Button size="sm" variant="ghost" onClick={() => revoke(k.id)} aria-label="Unieważnij">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
