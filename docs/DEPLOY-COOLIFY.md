# Deploy Solvio na własnej maszynie (Coolify / Docker)

Aplikacja buduje się z `Dockerfile` w root repo (multi-stage, Next.js standalone, port 3000).
W Coolify: **New Resource → Dockerfile**, wskaż repo i branch — reszta to zmienne środowiskowe.

## 1. Baza danych (wspólny Postgres)

Na współdzielonym Postgresie utwórz użytkownika i bazę:

```sql
CREATE USER solvio WITH PASSWORD 'TU_SILNE_HASLO';
CREATE DATABASE solvio OWNER solvio;
```

**Tabele tworzą się same** — kontener przy każdym starcie odpala
`drizzle-kit push` (patrz `docker-entrypoint.sh`): na pustej bazie tworzy
schemat, na istniejącej dociąga tylko zmiany. Nie musisz nic robić ręcznie.
Wyłączenie automatu: env `SKIP_DB_PUSH=1`.

Aplikacja sama wykrywa zwykłego Postgresa (driver `pg`); Neona używa tylko dla
URL-i `*.neon.tech` albo gdy ustawisz `DATABASE_PROVIDER=neon`.

## 2. Zmienne środowiskowe

### Wymagane

| Zmienna | Wartość / skąd wziąć |
|---|---|
| `DATABASE_URL` | `postgres://solvio:HASLO@HOST:5432/solvio` |
| `SESSION_SECRET` | 32+ losowych znaków (`openssl rand -hex 32`) — podpisuje cookie sesji |
| `OPENAI_API_KEY` | klucz OpenAI — napędza skan paragonów (OCR + kategoryzacja), analizę AI i porównywarkę cen. Produkcja Solvio używa tego samego klucza co Estalo (decyzja Wojtka 22.08.2026). |

### Opcjonalne

| Zmienna | Po co |
|---|---|
| `GEMINI_API_KEY` + `GEMINI_MODEL` | darmowy wariant awaryjny zamiast OpenAI (`gemini-2.5-flash`, klucz z https://aistudio.google.com/apikey). Na produkcji NIE ustawiony. |
| `NEXT_PUBLIC_APP_URL` | publiczny URL apki (linki w mailach itp.) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob — przechowywanie zdjęć paragonów i plików raportów; **bez tego skan działa**, tylko nie zapisuje zdjęcia |
| `AZURE_OCR_ENDPOINT` + `AZURE_OCR_KEY` | Azure Document Intelligence — dokładniejszy OCR + obsługa PDF; bez tego paragony czyta model wizyjny wybranego providera AI |
| `AZURE_OPENAI_*` | Azure zamiast OpenAI. Uwaga na kolejność w `lib/ai-client.ts`: Azure → OpenAI → Gemini, więc ustawienie zmiennych Azure PRZEJMUJE ruch z OpenAI. |
| `GOCARDLESS_SECRET_ID` + `GOCARDLESS_SECRET_KEY` | integracja bankowa (import transakcji) |

### Czego NIE ustawiać na Coolify

`LOCAL_NEON_PROXY_PORT` (tylko lokalny dev) i `DATABASE_PROVIDER` (autodetekcja wystarczy).

## 3. Co działa, a co wymaga płatnych kluczy

- ✅ Logowanie / rejestracja (email → cookie sesji, konta tworzą się same przy pierwszym logowaniu)
- ✅ Wydatki, budżety, grupy, raporty CSV/PDF/DOCX, dashboard, analiza
- ✅ **Skan paragonu przez Gemini (za darmo)** — zdjęcie → produkty z kategoriami → wydatek
- ⚠️ Promocje / audyt zakupów / porównywarka cen z danymi live wymagają `OPENAI_API_KEY`
  (web search nie jest dostępny na Gemini/Azure) — bez klucza te sekcje pokażą pusty stan
- ⚠️ PDF-y paragonów wymagają Azure OCR; Gemini czyta tylko zdjęcia

## 4. Health check

Coolify: healthcheck na `GET /login` (200). Kontener słucha na `0.0.0.0:3000`.
