import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from 'docx'

type Row = {
  id: string
  date: string
  description: string
  category: string
  amount: number
  currency: string
}
type PdfInput = { title: string; rows: Row[] }
type DocxInput = { title: string; rows: Row[] }

export async function buildCsvBuffer(rows: Row[]): Promise<Buffer> {
  const header = ['Date', 'Description', 'Category', 'Amount', 'Currency']
  const lines = [
    header.join(','),
    ...rows.map((r) =>
      [
        r.date,
        q(r.description),
        q(r.category),
        r.amount.toFixed(2),
        r.currency,
      ].join(',')
    ),
  ]
  return Buffer.from(lines.join('\n'), 'utf8')
}

export async function buildPdfBuffer(input: PdfInput): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const pageMargin = 40
  const lineH = 18

  let page = pdfDoc.addPage()
  const pageWidth = page.getWidth()
  let y = page.getHeight() - pageMargin

  const drawText = (
    text: string,
    x: number,
    yPos: number,
    bold = false,
    size = 12
  ) => {
    page.drawText(text, {
      x,
      y: yPos,
      size,
      font: bold ? fontBold : font,
      color: rgb(1 / 255, 1 / 255, 1 / 255),
    })
  }

  // Tytuł
  drawText(input.title, pageMargin, y, true, 18)
  y -= lineH * 1.5

  // Suma
  const total = input.rows.reduce((s, r) => s + r.amount, 0)
  const cur = input.rows[0]?.currency || ''
  drawText(`Total: ${total.toFixed(2)} ${cur}`, pageMargin, y)
  y -= lineH * 1.2

  // Nagłówki
  const colX = {
    date: pageMargin,
    desc: pageMargin + 90,
    cat: pageMargin + 320,
    amt: pageWidth - pageMargin - 90,
  }
  drawText('Date', colX.date, y, true)
  drawText('Description', colX.desc, y, true)
  drawText('Category', colX.cat, y, true)
  drawText('Amount', colX.amt, y, true)
  y -= lineH

  // Wiersze z page break
  const ensureSpace = () => {
    if (y < pageMargin + lineH * 2) {
      page = pdfDoc.addPage()
      y = page.getHeight() - pageMargin
    }
  }

  for (const r of input.rows) {
    ensureSpace()
    drawText(r.date, colX.date, y)
    drawText(r.description.slice(0, 48), colX.desc, y) // prosty clamp
    drawText(r.category.slice(0, 20), colX.cat, y)
    drawText(`${r.amount.toFixed(2)} ${r.currency}`, colX.amt, y)
    y -= lineH
  }

  const bytes = await pdfDoc.save()
  return Buffer.from(bytes)
}

export async function buildDocxBuffer(input: DocxInput): Promise<Buffer> {
  const total = input.rows.reduce((s, r) => s + r.amount, 0)
  const headerRow = new TableRow({
    children: ['Date', 'Description', 'Category', 'Amount', 'Currency'].map(
      (h) =>
        new TableCell({
          children: [
            new Paragraph({ children: [new TextRun({ text: h, bold: true })] }),
          ],
        })
    ),
  })
  const bodyRows = input.rows.map(
    (r) =>
      new TableRow({
        children: [
          r.date,
          r.description,
          r.category,
          r.amount.toFixed(2),
          r.currency,
        ].map((t) => new TableCell({ children: [new Paragraph(String(t))] })),
      })
  )
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
  })
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: input.title, bold: true, size: 32 }),
            ],
          }),
          new Paragraph(
            `Total: ${total.toFixed(2)} ${input.rows[0]?.currency || ''}`
          ),
          table,
        ],
      },
    ],
  })
  return await Packer.toBuffer(doc)
}

function q(s: string) {
  if (s.includes(',') || s.includes('"')) return `"${s.replace(/"/g, '""')}"`
  return s
}
