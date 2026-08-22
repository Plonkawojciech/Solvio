'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Link2, Link2Off, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

interface ConnectionView {
  connected: boolean
  baseUrl: string
  apiKeyHint: string | null
  autoPush: boolean
  defaultCategory: string
  lastSyncAt: string | null
  lastError: string | null
}

/**
 * Spięcie z zakładką Finanse w crm.programo.pl.
 *
 * Klucz wkleja człowiek i po zapisie nie wraca — trzymamy go zaszyfrowanego
 * po stronie serwera, a tutaj pokazujemy wyłącznie cztery ostatnie znaki.
 */
export function CrmConnection() {
  const [state, setState] = useState<ConnectionView | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('https://crm.programo.pl')
  const [autoPush, setAutoPush] = useState(false)
  const [category, setCategory] = useState('solvio')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/crm/connection')
    if (!res.ok) return
    const data: ConnectionView = await res.json()
    setState(data)
    setBaseUrl(data.baseUrl)
    setAutoPush(data.autoPush)
    setCategory(data.defaultCategory)
  }, [])

  useEffect(() => { void load() }, [load])

  async function save() {
    if (!apiKey.trim() && !state?.connected) {
      toast.error('Wklej klucz API z CRM-a')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/crm/connection', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ baseUrl, apiKey: apiKey.trim(), autoPush, defaultCategory: category }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Nie udało się połączyć')
        return
      }
      setState(data)
      setApiKey('')
      toast.success('Połączono z CRM')
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    try {
      await fetch('/api/crm/connection', { method: 'DELETE' })
      setApiKey('')
      await load()
      toast.success('Rozłączono')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-4 w-4" aria-hidden="true" />
          CRM Programo
        </CardTitle>
        <CardDescription>
          Wydatki z Solvio trafiają do zakładki Finanse w crm.programo.pl.
          {state?.connected && state.apiKeyHint
            ? ` Podpięty klucz kończy się na ${state.apiKeyHint}.`
            : ' Klucz API wystawisz w CRM-ie: Ustawienia → Klucze API (zakres WRITE).'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="crm-url">Adres CRM</Label>
          <Input id="crm-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="crm-key">
            {state?.connected ? 'Nowy klucz API (zostaw puste, żeby nie zmieniać)' : 'Klucz API'}
          </Label>
          <Input
            id="crm-key"
            type="password"
            autoComplete="off"
            placeholder="crmk_..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium">Wysyłaj każdy wydatek automatycznie</p>
            <p className="text-xs text-muted-foreground">
              Wyłączone: wypychasz ręcznie z listy wydatków.
            </p>
          </div>
          <Switch checked={autoPush} onCheckedChange={setAutoPush} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="crm-cat">Kubełek w Finansach CRM</Label>
          <Input id="crm-cat" value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>

        {state?.lastError && (
          <p className="text-sm text-destructive">Ostatni błąd synchronizacji: {state.lastError}</p>
        )}
        {state?.lastSyncAt && !state.lastError && (
          <p className="text-xs text-muted-foreground">
            Ostatnia synchronizacja: {new Date(state.lastSyncAt).toLocaleString('pl-PL')}
          </p>
        )}

        <div className="flex gap-2">
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {state?.connected ? 'Zapisz i sprawdź' : 'Połącz'}
          </Button>
          {state?.connected && (
            <Button variant="outline" onClick={disconnect} disabled={busy}>
              <Link2Off className="h-4 w-4" />
              Rozłącz
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
