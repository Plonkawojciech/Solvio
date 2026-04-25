"use client"

import { useEffect, useState } from "react"
import { FileCog, Loader2, FileDown, FileText, File, Archive } from "lucide-react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormField, FormItem, FormLabel, FormMessage, FormControl } from "@/components/ui/form"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { useTranslation } from "@/lib/i18n"

const schema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  minAmount: z.string().optional(),
  maxAmount: z.string().optional(),
  categories: z.array(z.string()),
  formatPdf: z.boolean(),
  formatCsv: z.boolean(),
  formatDocx: z.boolean(),
})

type Values = z.infer<typeof schema>

interface Category {
  id: string
  name: string
  icon?: string
}

export function CustomReportForm({ currency }: { currency: string }) {
  const { t, lang } = useTranslation()
  const [categories, setCategories] = useState<Category[]>([])
  const [categoriesLoaded, setCategoriesLoaded] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      formatPdf: true,
      formatCsv: false,
      formatDocx: false,
      categories: [],
      dateFrom: undefined,
      dateTo: undefined,
      minAmount: undefined,
      maxAmount: undefined,
    },
  })

  useEffect(() => {
    fetch('/api/data/settings')
      .then(r => r.json())
      .then(data => {
        if (data?.categories) setCategories(data.categories)
        setCategoriesLoaded(true)
      })
      .catch((error) => {
        console.error('Failed to fetch categories:', error)
        setCategories([])
        setCategoriesLoaded(true)
      })
  }, [])

  const selectedCategories = form.watch("categories")
  const formatPdf = form.watch("formatPdf")
  const formatCsv = form.watch("formatCsv")
  const formatDocx = form.watch("formatDocx")

  const selectedFormats = [
    formatPdf && "PDF",
    formatCsv && "CSV",
    formatDocx && "DOCX",
  ].filter(Boolean) as string[]

  const isMultiFormat = selectedFormats.length > 1

  function toggleCategory(name: string) {
    const current = form.getValues("categories")
    if (current.includes(name)) {
      form.setValue("categories", current.filter((c) => c !== name))
    } else {
      form.setValue("categories", [...current, name])
    }
  }

  async function onSubmit(values: Values) {
    const formats = [
      values.formatPdf && "pdf",
      values.formatCsv && "csv",
      values.formatDocx && "docx",
    ].filter(Boolean)

    if (formats.length === 0) {
      toast.error(t('reports.selectFormat'))
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/reports/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, currency }),
      })

      if (!res.ok) {
        const msg = await res.text()
        toast.error(t('reports.failedGenerate'), { description: msg })
        return
      }

      const blob = await res.blob()
      const disp = res.headers.get("Content-Disposition") || ""
      const name = /filename="([^"]+)"/.exec(disp)?.[1] || "report"
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)

      const isZip = name.endsWith(".zip")
      toast.success(t('reports.downloaded'), {
        description: isZip
          ? (lang === 'pl' ? `Pobrano archiwum ZIP z ${formats.length} plikami.` : `Downloaded ZIP archive with ${formats.length} files.`)
          : (lang === 'pl' ? `Pobrano plik ${name}.` : `Downloaded ${name}.`),
      })
    } catch (err) {
      toast.error(t('reports.networkError'), { description: String(err) })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5">
        {/* Date range row */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <FormField name="dateFrom" control={form.control} render={({ field }) => (
            <FormItem>
              <FormLabel suppressHydrationWarning>{t('reports.dateFrom')}</FormLabel>
              <FormControl><Input type="date" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField name="dateTo" control={form.control} render={({ field }) => (
            <FormItem>
              <FormLabel suppressHydrationWarning>{t('reports.dateTo')}</FormLabel>
              <FormControl><Input type="date" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        {/* Amount range row */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <FormField name="minAmount" control={form.control} render={({ field }) => (
            <FormItem>
              <FormLabel suppressHydrationWarning>
                {t('reports.minAmount')}{" "}
                <span className="text-muted-foreground font-normal text-xs">({currency})</span>
              </FormLabel>
              <FormControl><Input inputMode="decimal" placeholder="0.00" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField name="maxAmount" control={form.control} render={({ field }) => (
            <FormItem>
              <FormLabel suppressHydrationWarning>
                {t('reports.maxAmount')}{" "}
                <span className="text-muted-foreground font-normal text-xs">({currency})</span>
              </FormLabel>
              <FormControl><Input inputMode="decimal" placeholder="9999.99" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        {/* Categories multi-select */}
        <FormItem>
          <FormLabel suppressHydrationWarning>
            {t('reports.categories')}{" "}
            <span className="text-muted-foreground font-normal" suppressHydrationWarning>{t('reports.categoriesOptional')}</span>
          </FormLabel>
          <div className="flex flex-wrap gap-2 mt-1">
            {categories.map((cat) => {
              const checked = selectedCategories.includes(cat.name)
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleCategory(cat.name)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors cursor-pointer select-none ${
                    checked
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 border-border hover:bg-muted text-foreground"
                  }`}
                >
                  {cat.icon && <span>{cat.icon}</span>}
                  {cat.name}
                </button>
              )
            })}
            {!categoriesLoaded && (
              <span className="text-sm text-muted-foreground" suppressHydrationWarning>{t('reports.loadingCategories')}</span>
            )}
          </div>
          {selectedCategories.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {t('reports.selectedCategories')}: {selectedCategories.join(", ")}
            </p>
          )}
        </FormItem>

        {/* Format selection + submit */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between rounded-lg border bg-muted/10 p-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium" suppressHydrationWarning>{t('reports.formatLabel')}</p>
            <div className="flex items-center gap-5 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={form.watch("formatPdf")}
                  onCheckedChange={(v) => form.setValue("formatPdf", Boolean(v))}
                />
                <span className="flex items-center gap-1.5 text-sm">
                  <FileDown className="h-3.5 w-3.5 text-red-500" />
                  PDF
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={form.watch("formatCsv")}
                  onCheckedChange={(v) => form.setValue("formatCsv", Boolean(v))}
                />
                <span className="flex items-center gap-1.5 text-sm">
                  <FileText className="h-3.5 w-3.5 text-green-500" />
                  CSV
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={form.watch("formatDocx")}
                  onCheckedChange={(v) => form.setValue("formatDocx", Boolean(v))}
                />
                <span className="flex items-center gap-1.5 text-sm">
                  <File className="h-3.5 w-3.5 text-blue-500" />
                  DOCX
                </span>
              </label>
            </div>

            {/* Dynamic hint: single file vs ZIP */}
            {selectedFormats.length > 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {isMultiFormat ? (
                  <>
                    <Archive className="h-3 w-3" />
                    {t('reports.multipleFormatsZip')}
                  </>
                ) : (
                  t('reports.singleFormat')
                )}
              </p>
            )}
          </div>

          <Button type="submit" className="sm:self-end gap-2 min-w-[140px]" disabled={submitting} suppressHydrationWarning>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('reports.generating')}
              </>
            ) : (
              <>
                <FileCog className="h-4 w-4" />
                {t('reports.generate')}
                {selectedFormats.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0 h-4">
                    {selectedFormats.join("+")}
                  </Badge>
                )}
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  )
}
