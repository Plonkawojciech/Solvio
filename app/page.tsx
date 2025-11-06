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
    redirect('/dashboard')
  }

  // Funkcja pomocnicza do tworzenia klas animacji
  const getAnimationClasses = (base: string, delay?: string) => {
    return `${base} ${delay || ''}`.trim()
  }

  return (
    <>
      <main className="flex flex-col min-h-screen bg-background text-foreground overflow-x-hidden">
        {/* --- Hero Section --- */}
        <section className="flex flex-col items-center justify-center text-center px-6 sm:px-10 py-24 sm:py-36">
          <div className="flex flex-col items-center">
            <h2
              className={getAnimationClasses(
                'animate-fade-in-up text-4xl sm:text-6xl font-bold tracking-tighter mb-6 leading-tight max-w-4xl'
              )}
              style={{ animationFillMode: 'backwards' }}
            >
              An intelligent way to track your expenses
            </h2>
            <p
              className={getAnimationClasses(
                'animate-fade-in-up',
                'animation-delay-200 text-muted-foreground text-lg sm:text-xl max-w-xl mb-10'
              )}
              style={{ animationFillMode: 'backwards' }}
            >
              Solvio analyzes your receipts and automatically assigns them to
              categories. Scan. Save time. Gain control.
            </p>

            <div
              className={getAnimationClasses(
                'animate-fade-in-up',
                'animation-delay-400 w-full flex flex-col items-center'
              )}
              style={{ animationFillMode: 'backwards' }}
            >
              <JoinAccessList />
              <p className="text-sm text-muted-foreground mt-4">
                Join the early access list
              </p>
            </div>
          </div>
        </section>

        {/* --- PRODUCT PREVIEW --- */}
        <section
          className={getAnimationClasses(
            'animate-scale-in flex justify-center px-6 sm:px-10 mb-32 sm:mb-40',
            'animation-delay-300'
          )}
          style={{ animationFillMode: 'backwards' }}
        >
          <Card className="w-full p-0 max-w-5xl shadow-2xl shadow-primary/10 border border-border/30 bg-card/60 backdrop-blur-sm group overflow-hidden">
            {/* Efekt po najechaniu - subtelne podświetlenie */}
            <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <CardContent className="p-0">
              <div className="aspect-[16/9] w-full rounded-xl overflow-hidden bg-gradient-to-br from-muted/30 to-background flex items-center justify-center ">
                <ChartsGalleryPreview />
              </div>
            </CardContent>
          </Card>
        </section>

        {/* --- Features Section --- */}
        <section className="max-w-5xl mx-auto px-6 sm:px-10 grid sm:grid-cols-3 gap-x-10 gap-y-12 text-center mb-32 sm:mb-40">
          <div
            className={getAnimationClasses(
              'animate-fade-in-up',
              'animation-delay-400'
            )}
            style={{ animationFillMode: 'backwards' }}
          >
            <h3 className="text-xl font-semibold mb-3">📸 Scan receipts</h3>
            <p className="text-muted-foreground leading-relaxed">
              Take a picture of your receipt – Solvio will recognize the data
              automatically.
            </p>
          </div>
          <div
            className={getAnimationClasses(
              'animate-fade-in-up',
              'animation-delay-500'
            )}
            style={{ animationFillMode: 'backwards' }}
          >
            <h3 className="text-xl font-semibold mb-3">🤖 AI classification</h3>
            <p className="text-muted-foreground leading-relaxed">
              Expenses are sorted into the right categories without your input.
            </p>
          </div>
          <div
            className={getAnimationClasses(
              'animate-fade-in-up',
              'animation-delay-700'
            )}
            style={{ animationFillMode: 'backwards' }}
          >
            <h3 className="text-xl font-semibold mb-3">📊 Simple summaries</h3>
            <p className="text-muted-foreground leading-relaxed">
              One place to understand where your money is really going.
            </p>
          </div>
        </section>

        {/* --- Final CTA Section --- */}
        <section
          className={getAnimationClasses(
            'animate-fade-in-up',
            'animation-delay-700 text-center mb-24 sm:mb-32'
          )}
          style={{ animationFillMode: 'backwards' }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">
            Save time. Gain clarity.
          </h2>
          <Link href="/sign-up">
            {/* Interaktywny przycisk z transformacją po najechaniu */}
            <Button
              size="lg"
              className="px-8 h-12 text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 hover:scale-105"
            >
              Get Started with Solvio
            </Button>
          </Link>
        </section>
      </main>
      <Footer />
    </>
  )
}
