'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  ChartAreaInteractive,
  ChartsGalleryPreview,
  WeeklyChart,
} from '@/components/WeeklyCharts'

export default function Page() {
  return (
    <main className="flex flex-col min-h-screen bg-background text-foreground">
      <section className="flex flex-col items-center justify-center text-center px-6 sm:px-10 py-24 sm:py-36">
        <h2 className="text-4xl sm:text-6xl font-semibold tracking-tight mb-6 leading-tight max-w-3xl">
          Inteligentny sposób na śledzenie wydatków
        </h2>
        <p className="text-muted-foreground text-lg sm:text-xl max-w-xl mb-10">
          Solvio analizuje paragony i automatycznie przypisuje je do kategorii.
          Skanuj. Oszczędzaj czas. Zyskaj kontrolę.
        </p>

        <div className="flex w-full max-w-md gap-2">
          <Input placeholder="Twój e-mail" className="text-base h-12" />
          <Button size="lg" className="h-12 px-6">
            Dołącz
          </Button>
        </div>

        <p className="text-sm text-muted-foreground mt-4">
          Dołącz do listy wczesnego dostępu
        </p>
      </section>

      {/* PRODUCT PREVIEW */}
      <section className="flex justify-center px-6 sm:px-10 mb-32">
        <Card className="w-full p-0 max-w-5xl shadow-xl border border-border/60 bg-card/60 backdrop-blur-sm">
          <CardContent className="p-0">
            <div className="aspect-[16/9] w-full rounded-xl overflow-hidden bg-gradient-to-br from-muted to-background flex items-center justify-center ">
              {/* ChartAreaInteractive musi mieć full width i height */}
              <ChartsGalleryPreview />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="max-w-5xl mx-auto px-6 sm:px-10 grid sm:grid-cols-3 gap-10 text-center mb-32">
        <div>
          <h3 className="text-lg font-medium mb-2">📸 Skanuj paragony</h3>
          <p className="text-muted-foreground">
            Zrób zdjęcie rachunku – Solvio rozpozna dane automatycznie.
          </p>
        </div>
        <div>
          <h3 className="text-lg font-medium mb-2">🤖 AI klasyfikacja</h3>
          <p className="text-muted-foreground">
            Wydatki trafiają do właściwych kategorii bez Twojej ingerencji.
          </p>
        </div>
        <div>
          <h3 className="text-lg font-medium mb-2">📊 Proste podsumowania</h3>
          <p className="text-muted-foreground">
            Jedno miejsce, by zrozumieć, gdzie naprawdę uciekają Twoje
            pieniądze.
          </p>
        </div>
      </section>

      <section className="text-center mb-24">
        <h2 className="text-3xl font-semibold mb-6">
          Oszczędzaj czas i zyskaj jasny obraz finansów
        </h2>
        <Button size="lg" className="px-8 h-12 text-base">
          Zacznij z Solvio
        </Button>
      </section>
    </main>
  )
}
