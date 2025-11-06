"use client"

import { FileCog } from "lucide-react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormField, FormItem, FormLabel, FormMessage, FormControl } from "@/components/ui/form"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"

const schema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  minAmount: z.string().optional(),
  maxAmount: z.string().optional(),
  categories: z.array(z.string()).optional(),
  formatPdf: z.boolean().default(true),
  formatCsv: z.boolean().default(false),
  formatDocx: z.boolean().default(false),
})

type Values = z.infer<typeof schema>

export function CustomReportForm({ currency }: { currency: string }) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { formatPdf: true, formatCsv: false, formatDocx: false, categories: [] },
  })

  async function onSubmit(values: Values) {
    const formats = [
      values.formatPdf && "pdf",
      values.formatCsv && "csv",
      values.formatDocx && "docx",
    ].filter(Boolean)

    if (formats.length === 0) {
      toast.error("Select at least one format")
      return
    }

    const res = await fetch("/api/reports/custom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, currency }),
    })

    if (!res.ok) {
      const msg = await res.text()
      toast.error("Failed to generate", { description: msg })
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
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <FormField name="dateFrom" control={form.control} render={({ field }) => (
          <FormItem>
            <FormLabel>Date from</FormLabel>
            <FormControl><Input type="date" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField name="dateTo" control={form.control} render={({ field }) => (
          <FormItem>
            <FormLabel>Date to</FormLabel>
            <FormControl><Input type="date" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField name="minAmount" control={form.control} render={({ field }) => (
          <FormItem>
            <FormLabel>Min amount</FormLabel>
            <FormControl><Input inputMode="decimal" placeholder="0.00" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField name="maxAmount" control={form.control} render={({ field }) => (
          <FormItem>
            <FormLabel>Max amount</FormLabel>
            <FormControl><Input inputMode="decimal" placeholder="9999.99" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        {/* Prosty multi-select kategorii: po stronie API jeśli pusta tablica -> wszystkie */}
        <FormItem className="md:col-span-2">
          <FormLabel>Categories (optional)</FormLabel>
          <FormControl>
            <select multiple className="w-full rounded-md border border-input bg-background p-2 text-sm"
              onChange={(e) => {
                const vals = Array.from(e.target.selectedOptions).map(o => o.value)
                form.setValue("categories", vals)
              }}>
              <option value="">All categories</option>
              {/* opcjonalnie: w przyszłości możesz zasilić to SSR-em lub oddzielnym fetch */}
            </select>
          </FormControl>
        </FormItem>

        <div className="flex items-center gap-6 md:col-span-2">
          <label className="flex items-center gap-2">
            <Checkbox checked={form.watch("formatPdf")} onCheckedChange={(v) => form.setValue("formatPdf", Boolean(v))} /> PDF
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={form.watch("formatCsv")} onCheckedChange={(v) => form.setValue("formatCsv", Boolean(v))} /> CSV
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={form.watch("formatDocx")} onCheckedChange={(v) => form.setValue("formatDocx", Boolean(v))} /> DOCX
          </label>
          <Button type="submit" className="ml-auto"><FileCog className="h-4 w-4 mr-2" /> Generate</Button>
        </div>
      </form>
    </Form>
  )
}
