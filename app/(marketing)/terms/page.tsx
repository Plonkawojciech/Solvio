import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Regulamin — Solvio',
  description: 'Zasady korzystania z aplikacji Solvio.',
}

// Terms of service rendered inside the (marketing) layout. Linked from the
// iOS app (Settings → O aplikacji → Regulamin). Reflects how the app works;
// legal specifics should be reviewed before public launch.
export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
      <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Regulamin</h1>
      <p className="mt-3 text-sm text-muted-foreground">Ostatnia aktualizacja: 29 maja 2026</p>

      <div className="mt-10 space-y-10 text-[15px] leading-relaxed text-foreground/90">
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">1. Usługa</h2>
          <p>
            Solvio to aplikacja do śledzenia i analizy wydatków: skanowanie paragonów, kategoryzacja,
            porównywanie cen, rozliczenia grupowe oraz raporty. Usługę świadczy <strong>Programo
            s.c.</strong> Korzystając z Solvio, akceptujesz niniejszy regulamin.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">2. Konto</h2>
          <p>
            Konto zakładasz, podając adres e-mail. Odpowiadasz za dostęp do swojej skrzynki i
            urządzenia. Konto jest przeznaczone do użytku osobistego (lub Twojej firmy w trybie
            biznesowym) i nie należy go udostępniać osobom trzecim.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">3. Dozwolone korzystanie</h2>
          <p>
            Zobowiązujesz się nie wykorzystywać Solvio do działań niezgodnych z prawem, nie zakłócać
            działania usługi, nie próbować uzyskać nieuprawnionego dostępu do danych innych
            użytkowników ani nie obciążać infrastruktury w sposób nadmierny lub zautomatyzowany.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">4. Twoje treści</h2>
          <p>
            Zachowujesz prawa do danych, które wprowadzasz (paragony, wydatki, notatki). Udzielasz nam
            jedynie ograniczonej licencji niezbędnej do przetwarzania tych danych w celu świadczenia
            usługi (np. odczyt paragonu, generowanie analiz). Szczegóły opisuje{' '}
            <a href="/privacy" className="font-medium underline underline-offset-4">
              Polityka prywatności
            </a>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">5. Analizy AI — charakter informacyjny</h2>
          <p>
            Sugestie, kategoryzacje, predykcje oszczędności i informacje o promocjach generowane są
            automatycznie i mają charakter wyłącznie informacyjny. Mogą być niedokładne i nie stanowią
            porady finansowej, podatkowej ani prawnej. Decyzje podejmujesz na własną odpowiedzialność.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">6. Integracja bankowa</h2>
          <p>
            Połączenie konta bankowego jest opcjonalne i realizowane przez licencjonowanego dostawcę
            usług dostępu do informacji o rachunku (AIS). Udostępniamy wyłącznie odczyt historii
            transakcji; nie inicjujemy płatności. Połączenie możesz w każdej chwili odłączyć.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">7. Dostępność i zmiany</h2>
          <p>
            Dokładamy starań, aby usługa działała nieprzerwanie, ale nie gwarantujemy stałej
            dostępności. Możemy rozwijać, zmieniać lub wycofywać funkcje. O istotnych zmianach
            regulaminu poinformujemy w aplikacji lub e-mailem.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">8. Odpowiedzialność</h2>
          <p>
            Usługa jest dostarczana „taka, jaka jest”. W granicach dozwolonych prawem nie ponosimy
            odpowiedzialności za szkody pośrednie wynikające z korzystania z Solvio. Niniejsze
            postanowienie nie ogranicza praw konsumenta wynikających z bezwzględnie obowiązujących
            przepisów.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">9. Rozwiązanie</h2>
          <p>
            Możesz w każdej chwili usunąć konto w aplikacji (Ustawienia → „Usuń konto”), co kończy
            korzystanie z usługi i trwale usuwa Twoje dane.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">10. Prawo właściwe i kontakt</h2>
          <p>
            W sprawach nieuregulowanych zastosowanie ma prawo polskie. Kontakt:{' '}
            <a href="mailto:support@solvio.app" className="font-medium underline underline-offset-4">
              support@solvio.app
            </a>
            .
          </p>
        </section>
      </div>
    </article>
  )
}
