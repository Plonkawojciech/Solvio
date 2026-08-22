import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Polityka prywatności — Solvio',
  description: 'Jak Solvio przetwarza i chroni Twoje dane.',
}

// Legal page rendered inside the (marketing) layout (Header + Footer).
// Linked from the iOS app (Settings → O aplikacji → Polityka prywatności)
// and required for App Store submission. Content reflects the app's real
// data flows; Wojtek should have the legal specifics reviewed before launch.
export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
      <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        Polityka prywatności
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">Ostatnia aktualizacja: 29 maja 2026</p>

      <div className="mt-10 space-y-10 text-[15px] leading-relaxed text-foreground/90">
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">1. Administrator danych</h2>
          <p>
            Administratorem Twoich danych osobowych jest <strong>Programo s.c.</strong> — twórca
            aplikacji Solvio. W sprawach dotyczących prywatności możesz skontaktować się z nami pod
            adresem{' '}
            <a href="mailto:support@solvio.app" className="font-medium underline underline-offset-4">
              support@solvio.app
            </a>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">2. Jakie dane przetwarzamy</h2>
          <ul className="list-disc space-y-2 pl-5 text-foreground/90">
            <li><strong>Adres e-mail</strong> — identyfikuje Twoje konto i służy do logowania.</li>
            <li>
              <strong>Dane o wydatkach</strong> — paragony (zdjęcia oraz tekst odczytany przez OCR),
              pozycje, kwoty, kategorie, budżety, cele oszczędnościowe i notatki, które dodajesz.
            </li>
            <li>
              <strong>Dane grupowe</strong> — jeśli korzystasz z dzielenia kosztów: nazwy grup,
              członkowie i rozliczenia.
            </li>
            <li>
              <strong>Dane firmowe</strong> (tryb biznesowy, opcjonalnie) — faktury, dane do VAT/JPK.
            </li>
            <li>
              <strong>Dane bankowe</strong> (opcjonalnie) — jeśli świadomie połączysz konto bankowe,
              pobieramy historię transakcji za pośrednictwem licencjonowanego dostawcy AIS
              (GoCardless / Nordigen). Możesz odłączyć bank w każdej chwili.
            </li>
            <li>
              <strong>Dane techniczne</strong> — minimalne informacje niezbędne do działania i
              bezpieczeństwa usługi (np. adres IP w logach bezpieczeństwa, wersja aplikacji).
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">3. Cele i podstawy prawne</h2>
          <p>
            Przetwarzamy dane, aby świadczyć usługę (art. 6 ust. 1 lit. b RODO — wykonanie umowy):
            zapisywanie i analiza wydatków, kategoryzacja, raporty i rozliczenia grupowe. Logi
            bezpieczeństwa przetwarzamy w oparciu o nasz uzasadniony interes (lit. f) — ochrona konta
            przed nadużyciami. Integrację bankową uruchamiamy wyłącznie na podstawie Twojej wyraźnej
            zgody (lit. a), którą możesz wycofać, odłączając bank.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">4. Przetwarzanie przez AI i OCR</h2>
          <p>
            Aby odczytać paragony oraz generować analizy i sugestie oszczędności, korzystamy z
            usług przetwarzania AI i OCR (Microsoft Azure OpenAI / OpenAI oraz Azure Document
            Intelligence). Treść paragonu lub zapytania jest przesyłana do tych dostawców wyłącznie w
            celu wykonania danej operacji. Nie wykorzystujemy Twoich danych do trenowania modeli i
            nie sprzedajemy ich.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">5. Gdzie przechowujemy dane</h2>
          <p>
            Dane przechowujemy w bazie danych zlokalizowanej w Unii Europejskiej (Neon, region
            Frankfurt). Zdjęcia paragonów i wygenerowane raporty przechowujemy w usłudze Vercel Blob.
            Transmisja danych jest szyfrowana (HTTPS/TLS), a wrażliwe tokeny są szyfrowane „w
            spoczynku”.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">6. Podmioty przetwarzające</h2>
          <p>
            Powierzamy dane zaufanym dostawcom działającym w naszym imieniu wyłącznie w zakresie
            niezbędnym do działania usługi: hosting i baza danych (Vercel, Neon), przetwarzanie AI/OCR
            (Microsoft Azure, OpenAI) oraz — jeśli włączysz integrację — dostawca danych bankowych
            (GoCardless / Nordigen). Nie udostępniamy danych w celach marketingowych ani ich nie
            sprzedajemy.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">7. Twoje prawa</h2>
          <p>
            Masz prawo dostępu do danych, ich sprostowania, ograniczenia przetwarzania, przenoszenia
            oraz usunięcia. Najważniejsze z nich zrealizujesz bezpośrednio w aplikacji:
          </p>
          <ul className="list-disc space-y-2 pl-5 text-foreground/90">
            <li>
              <strong>Eksport danych</strong> — Ustawienia → „Eksport danych”. Pobierzesz komplet
              swoich danych w pliku JSON.
            </li>
            <li>
              <strong>Usunięcie konta</strong> — Ustawienia → „Usuń konto”. Trwale i nieodwracalnie
              usuwa Twoje konto oraz wszystkie powiązane dane z naszych serwerów.
            </li>
          </ul>
          <p>
            Przysługuje Ci również prawo wniesienia skargi do organu nadzorczego (w Polsce: Prezes
            Urzędu Ochrony Danych Osobowych).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">8. Okres przechowywania</h2>
          <p>
            Dane przechowujemy tak długo, jak długo istnieje Twoje konto. Po usunięciu konta dane są
            trwale usuwane; w logach bezpieczeństwa może pozostać jedynie pseudonimowy zapis faktu
            usunięcia konta.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">9. Bezpieczeństwo</h2>
          <p>
            Stosujemy środki techniczne i organizacyjne odpowiednie do ryzyka: szyfrowanie transmisji,
            podpisane sesje, ochronę przed CSRF, limity zapytań oraz izolację danych każdego
            użytkownika. Żadne rozwiązanie nie daje 100% gwarancji — dokładamy jednak starań, aby
            chronić Twoje dane.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">10. Zmiany polityki</h2>
          <p>
            Możemy aktualizować niniejszą politykę. O istotnych zmianach poinformujemy w aplikacji lub
            e-mailem. Data ostatniej aktualizacji znajduje się na górze tej strony.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">11. Kontakt</h2>
          <p>
            Pytania dotyczące prywatności:{' '}
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
