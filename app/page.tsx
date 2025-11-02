import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ChartsGalleryPreview } from '@/components/WeeklyCharts'
import Footer from '@/components/footer'
import { createClient } from '../lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import JoinAccessList from '@/components/landing_page/join_access_list'

export default async function Page() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/protected')
  }
  return (
    <>

      <main className="flex flex-col min-h-screen bg-background text-foreground">
        {/* --- Hero Section --- */}
        <section className="flex flex-col items-center justify-center text-center px-6 sm:px-10 py-24 sm:py-36">
          <h2 className="text-4xl sm:text-6xl font-semibold tracking-tight mb-6 leading-tight max-w-3xl">
            An intelligent way to track your expenses
          </h2>
          <p className="text-muted-foreground text-lg sm:text-xl max-w-xl mb-10">
            Solvio analyzes your receipts and automatically assigns them to categories.
            Scan. Save time. Gain control.
          </p>

          <JoinAccessList />

          <p className="text-sm text-muted-foreground mt-4">
            Join the early access list
          </p>
        </section>

        {/* --- PRODUCT PREVIEW --- */}
        <section className="flex justify-center px-6 sm:px-10 mb-32">
          <Card className="w-full p-0 max-w-5xl shadow-xl border border-border/60 bg-card/60 backdrop-blur-sm">
            <CardContent className="p-0">
              <div className="aspect-[16/9] w-full rounded-xl overflow-hidden bg-gradient-to-br from-muted to-background flex items-center justify-center ">
                <ChartsGalleryPreview />
              </div>
            </CardContent>
          </Card>
        </section>

        {/* --- Features Section --- */}
        <section className="max-w-5xl mx-auto px-6 sm:px-10 grid sm:grid-cols-3 gap-10 text-center mb-32">
          <div>
            <h3 className="text-lg font-medium mb-2">📸 Scan receipts</h3>
            <p className="text-muted-foreground">
              Take a picture of your receipt – Solvio will recognize the data automatically.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-medium mb-2">🤖 AI classification</h3>
            <p className="text-muted-foreground">
              Expenses are sorted into the right categories without your input.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-medium mb-2">📊 Simple summaries</h3>
            <p className="text-muted-foreground">
              One place to understand where your money is really going.
            </p>
          </div>
        </section>

        {/* --- Final CTA Section --- */}
        <section className="text-center mb-24">
          <h2 className="text-3xl font-semibold mb-6">
            Save time and get a clear picture of your finances
          </h2>
          <Link href="/auth/sign-up">
            <Button size="lg" className="px-8 h-12 text-base">
              Get Started with Solvio
            </Button>
          </Link>
        </section>
      </main>
      <Footer />

    </>
  )
}