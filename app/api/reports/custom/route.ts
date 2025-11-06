import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { buildCsvBuffer, buildPdfBuffer, buildDocxBuffer } from "@/lib/reports/builders"
import JSZip from "jszip"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const body = await req.json()
  const { dateFrom, dateTo, minAmount, maxAmount, categories, currency } = body as {
    dateFrom?: string; dateTo?: string; minAmount?: string; maxAmount?: string; categories?: string[]; currency?: string
  }

  let q = supabase
    .from("expenses")
    .select("id, date, title, amount, currency, category_id, categories(name)")
    .eq("user_id", user.id)

  if (dateFrom) q = q.gte("date", dateFrom)
  if (dateTo)   q = q.lte("date", dateTo)
  if (minAmount) q = q.gte("amount", Number(minAmount))
  if (maxAmount) q = q.lte("amount", Number(maxAmount))
  if (categories && categories.length > 0) q = q.in("category_id", categories)

  const { data, error } = await q.order("date", { ascending: true })
  if (error) return new NextResponse(error.message, { status: 500 })

  const rows = (data ?? []).map(r => ({
    id: r.id as string,
    date: r.date as string,
    description: r.title as string,
    category: r.categories?.name || "Uncategorized",
    amount: Number(r.amount),
    currency: (r as any).currency || currency || "PLN",
  }))

  const formats = [
    { key: "pdf", buf: await buildPdfBuffer({ title: "Custom report", rows }) },
    { key: "csv", buf: await buildCsvBuffer(rows) },
    { key: "docx", buf: await buildDocxBuffer({ title: "Custom report", rows }) },
  ]

  // jeśli użytkownik wybrał jeden format -> zwróć plik bez ZIP
  const requested: string[] = [
    body.formatPdf && "pdf",
    body.formatCsv && "csv",
    body.formatDocx && "docx",
  ].filter(Boolean)

  if (requested.length === 1) {
    const f = formats.find(f => f.key === requested[0])!
    return new NextResponse(f.buf, {
      status: 200,
      headers: {
        "Content-Type": contentType(f.key),
        "Content-Disposition": `attachment; filename="report.${f.key}"`,
      },
    })
  }

  // kilka formatów -> ZIP
  const zip = new JSZip()
  for (const f of formats.filter(f => requested.includes(f.key))) {
    zip.file(`report.${f.key}`, f.buf)
  }
  const blob = await zip.generateAsync({ type: "nodebuffer" })
  return new NextResponse(blob, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="report.zip"`,
    },
  })
}

function contentType(ext: string) {
  if (ext === "csv") return "text/csv"
  if (ext === "pdf") return "application/pdf"
  return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
}
