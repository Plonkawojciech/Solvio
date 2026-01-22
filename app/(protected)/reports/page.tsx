// app/reports/page.tsx
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RefreshCcw, FileDown, FileText, File } from "lucide-react"
import { CustomReportForm } from "@/components/protected/reports/custom-report-form"
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"

type FileTriplet = { csv?: string; pdf?: string; docx?: string }

function ymKey(y: number, m: number) {
  return `${y}-${String(m).padStart(2, "0")}`
}

export default async function ReportsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [{ data: settings }, { data: dates, error: datesError }] = await Promise.all([
    supabase.from("user_settings").select("currency_id, language_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("expenses").select("date").eq("user_id", user.id).order("date", { ascending: true }),
  ])

  if (datesError && process.env.NODE_ENV === 'development') {
    console.error("[Reports] expenses dates error:", datesError)
  }

  const currency = (settings?.currency_id || "PLN").toUpperCase()
  const lang = (settings?.language_id || "EN").toUpperCase()
  const locale = lang === "PL" ? "pl-PL" : "en-US"

  // rok -> miesiące z wydatkami
  const yearToMonths = new Map<number, Set<number>>()
  for (const r of dates ?? []) {
    const d = new Date(r.date as string)
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth() + 1
    if (!yearToMonths.has(y)) yearToMonths.set(y, new Set())
    yearToMonths.get(y)!.add(m)
  }

  const years = Array.from(yearToMonths.keys()).sort((a, b) => b - a)
  const yearBlocks = years.map((y) => ({
    year: y,
    months: Array.from(yearToMonths.get(y)!).sort((a, b) => b - a),
  }))

  // podpisane URL-e jeśli plik istnieje
  async function getTriplet(pathPrefix: string): Promise<FileTriplet> {
    const folder = pathPrefix.replace(/\/[^/]*$/, "")
    const { data: files } = await supabase.storage.from("reports").list(folder, { limit: 100 })
    const names = new Set((files ?? []).map((f) => `${folder}/${f.name}`))

    const csv = `${pathPrefix}.csv`
    const pdf = `${pathPrefix}.pdf`
    const docx = `${pathPrefix}.docx`

    const sign = async (p: string) => {
      const { data, error } = await supabase.storage.from("reports").createSignedUrl(p, 60 * 60)
      return error ? undefined : data.signedUrl
    }

    const out: FileTriplet = {}
    if (names.has(csv)) out.csv = await sign(csv)
    if (names.has(pdf)) out.pdf = await sign(pdf)
    if (names.has(docx)) out.docx = await sign(docx)
    return out
  }

  const yearlyWithFiles = await Promise.all(
    yearBlocks.map(async ({ year }) => ({ year, files: await getTriplet(`${user.id}/${year}/yearly`) })),
  )

  const monthlyMap = new Map<string, FileTriplet>()
  await Promise.all(
    yearBlocks.flatMap(({ year, months }) =>
      months.map(async (m) => {
        const key = ymKey(year, m)
        const files = await getTriplet(`${user.id}/${key}/monthly`)
        monthlyMap.set(key, files)
      }),
    ),
  )

  return (
    <div className="flex flex-col gap-4 sm:gap-6 md:gap-8">
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Reports</h2>
        <p className="text-muted-foreground">
          Download yearly summaries or expand a year to access monthly files. Only periods with expenses are shown.
        </p>
      </div>

      {/* Scrollowany kontener na grid roczników: 40% wysokości ekranu */}
      <div>
        <div className="
          h-[40vh] overflow-y-auto p-3 sm:p-4
          [scrollbar-width:none] [-ms-overflow-style:none]
          [&::-webkit-scrollbar]:hidden
        ">
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 pr-1">
            {yearBlocks.map(({ year, months }) => {
              const yFiles = yearlyWithFiles.find((y) => y.year === year)?.files ?? {}
              return (
                <Card key={year} className="flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle>{year}</CardTitle>
                        <CardDescription>Yearly summary</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <DownloadButtons files={yFiles} />
                        <form action="/api/reports/generate" method="POST">
                          <input type="hidden" name="type" value="yearly" />
                          <input type="hidden" name="year" value={year} />
                          <Button variant="ghost" size="icon" type="submit" title="Regenerate">
                            <RefreshCcw className="h-4 w-4" />
                          </Button>
                        </form>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-0">
                    <details className="group">
                      <summary className="cursor-pointer select-none rounded-md border bg-muted/10 px-3 py-2 text-sm font-medium">
                        Show months
                      </summary>

                      <div className="mt-3 grid gap-3 grid-cols-1">
                        {months.map((m) => {
                          const key = ymKey(year, m)
                          const files = monthlyMap.get(key) ?? {}
                          const label = new Date(year, m - 1, 1).toLocaleDateString(locale, {
                            month: "long",
                            year: "numeric",
                          })
                          return (
                            <div key={key} className="flex items-center justify-between rounded-md border bg-muted/5 p-3">
                              <div className="min-w-0">
                                <div className="font-medium truncate">{label}</div>
                                <div className="text-xs text-muted-foreground">{currency}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <DownloadButtons files={files} compact />
                                <form action="/api/reports/generate" method="POST">
                                  <input type="hidden" name="type" value="monthly" />
                                  <input type="hidden" name="ym" value={key} />
                                  <Button variant="ghost" size="icon" type="submit" title="Regenerate">
                                    <RefreshCcw className="h-4 w-4" />
                                  </Button>
                                </form>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </details>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </div>

      {/* Custom report */}
      <Card>
        <CardHeader>
          <CardTitle>Custom report</CardTitle>
          <CardDescription>Pick range, filters and format.</CardDescription>
        </CardHeader>
        <CardContent>
          <CustomReportForm currency={currency} />
        </CardContent>
      </Card>
    </div>
  )
}

function DownloadButtons({ files, compact }: { files: { csv?: string; pdf?: string; docx?: string }; compact?: boolean }) {
  const IconBtn = ({
    url,
    label,
    Icon,
  }: {
    url?: string
    label: "PDF" | "CSV" | "DOCX"
    Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  }) => {
    const btn = url ? (
      <Button asChild size={compact ? "icon" : "default"}>
        <a href={url} target="_blank" rel="noreferrer" aria-label={`Download ${label}`} title={label}>
          <Icon className="h-4 w-4" />
          {!compact && <span className="ml-2">{label}</span>}
        </a>
      </Button>
    ) : (
      <Button size={compact ? "icon" : "default"} variant="outline" disabled aria-label={`${label} not available`} title={`${label} not available`}>
        <Icon className="h-4 w-4" />
        {!compact && <span className="ml-2">{label}</span>}
      </Button>
    )

    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>{btn}</TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <div className="flex gap-2">
      <IconBtn url={files.pdf} label="PDF" Icon={FileDown} />
      <IconBtn url={files.csv} label="CSV" Icon={FileText} />
      <IconBtn url={files.docx} label="DOCX" Icon={File} />
    </div>
  )
}
