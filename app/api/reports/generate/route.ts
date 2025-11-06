import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { buildCsvBuffer, buildPdfBuffer, buildDocxBuffer } from "@/lib/reports/builders"

// ten route używa Node bibliotek
export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const type = String(form.get("type") || "")
  const ym = form.get("ym")?.toString() // "YYYY-MM"
  const yearStr = form.get("year")?.toString()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  // zakres dat
  let dateFrom = "", dateTo = ""
  if (type === "monthly" && ym) {
    const [y, m] = ym.split("-").map(Number)
    const from = new Date(y, m - 1, 1)
    const to = new Date(y, m, 0)
    dateFrom = from.toISOString().slice(0,10)
    dateTo   = to.toISOString().slice(0,10)
  } else if (type === "yearly" && yearStr) {
    const y = Number(yearStr)
    dateFrom = new Date(y, 0, 1).toISOString().slice(0,10)
    dateTo   = new Date(y, 11, 31).toISOString().slice(0,10)
  } else {
    return new NextResponse("Bad params", { status: 400 })
  }

  // dane
  const { data: rows, error } = await supabase
    .from("expenses")
    .select("id, date, title, amount, currency, categories(name)")
    .eq("user_id", user.id)
    .gte("date", dateFrom)
    .lte("date", dateTo)
    .order("date", { ascending: true })

  if (error) return new NextResponse(error.message, { status: 500 })

  const norm = (rows ?? []).map(r => ({
    id: r.id as string,
    date: r.date as string,
    description: r.title as string,
    category: r.categories?.name || "Uncategorized",
    amount: Number(r.amount),
    currency: (r as any).currency || "PLN",
  }))

  // generacja trzech formatów
  const csv = await buildCsvBuffer(norm)
  const pdf = await buildPdfBuffer({ title: type === "yearly" ? `Yearly report ${yearStr}` : `Monthly report ${ym}`, rows: norm })
  const docx = await buildDocxBuffer({ title: type === "yearly" ? `Yearly report ${yearStr}` : `Monthly report ${ym}`, rows: norm })

  // ścieżki w storage
  const base = type === "yearly"
    ? `${user.id}/${yearStr}/yearly`
    : `${user.id}/${ym}/monthly`

  const upload = async (ext: string, buf: Buffer) => {
    return await supabase.storage.from("reports").upload(`${base}.${ext}`, buf, { upsert: true, contentType: ({
      csv: "text/csv", pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    } as any)[ext] })
  }

  const [u1, u2, u3] = await Promise.all([
    upload("csv", csv),
    upload("pdf", pdf),
    upload("docx", docx),
  ])
  if (u1.error || u2.error || u3.error) {
    const msg = u1.error?.message || u2.error?.message || u3.error?.message
    return new NextResponse(msg, { status: 500 })
  }

  const url = new URL("/reports?regen=1", req.url)

  return NextResponse.redirect(url, 303)

}
