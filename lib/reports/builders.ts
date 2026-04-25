import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  ShadingType,
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
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier)
  const fontMonoBold = await pdfDoc.embedFont(StandardFonts.CourierBold)

  const BLACK = rgb(0.08, 0.08, 0.08)
  const MUTED = rgb(0.5, 0.5, 0.5)
  const BG_MUTED = rgb(0.96, 0.94, 0.91)

  const pageMargin = 40
  const lineH = 16

  let page: PDFPage = pdfDoc.addPage()
  const pageWidth = page.getWidth()
  const pageHeight = page.getHeight()
  let y = pageHeight - pageMargin

  const drawText = (
    p: PDFPage,
    text: string,
    x: number,
    yPos: number,
    opts: { bold?: boolean; size?: number; mono?: boolean; color?: ReturnType<typeof rgb> } = {}
  ) => {
    const size = opts.size ?? 10
    const f: PDFFont = opts.mono
      ? (opts.bold ? fontMonoBold : fontMono)
      : (opts.bold ? fontBold : font)
    p.drawText(text, { x, y: yPos, size, font: f, color: opts.color ?? BLACK })
  }

  const drawRect = (
    p: PDFPage,
    x: number,
    yPos: number,
    w: number,
    h: number,
    opts: { fill?: ReturnType<typeof rgb>; stroke?: ReturnType<typeof rgb>; borderWidth?: number } = {}
  ) => {
    p.drawRectangle({
      x,
      y: yPos,
      width: w,
      height: h,
      color: opts.fill,
      borderColor: opts.stroke,
      borderWidth: opts.borderWidth ?? 0,
    })
  }

  // Header box — solid black block with title
  const headerH = 56
  drawRect(page, pageMargin, y - headerH, pageWidth - pageMargin * 2, headerH, {
    fill: BLACK,
  })
  drawText(page, '// SOLVIO REPORT', pageMargin + 14, y - 18, { mono: true, bold: true, size: 9, color: rgb(1, 1, 1) })
  drawText(page, input.title, pageMargin + 14, y - 40, { bold: true, size: 16, color: rgb(1, 1, 1) })

  y -= headerH + 20

  // Summary box
  const total = input.rows.reduce((s, r) => s + r.amount, 0)
  const cur = input.rows[0]?.currency || ''
  const summaryH = 40
  drawRect(page, pageMargin, y - summaryH, pageWidth - pageMargin * 2, summaryH, {
    fill: BG_MUTED,
    stroke: BLACK,
    borderWidth: 1.5,
  })
  drawText(page, 'TOTAL', pageMargin + 14, y - 14, { mono: true, bold: true, size: 9, color: MUTED })
  drawText(page, `${total.toFixed(2)} ${cur}`, pageMargin + 14, y - 32, { mono: true, bold: true, size: 16 })
  drawText(page, `${input.rows.length} ${input.rows.length === 1 ? 'ENTRY' : 'ENTRIES'}`, pageWidth - pageMargin - 14 - 80, y - 14, { mono: true, bold: true, size: 9, color: MUTED })
  drawText(page, new Date().toISOString().slice(0, 10), pageWidth - pageMargin - 14 - 80, y - 32, { mono: true, size: 11 })

  y -= summaryH + 20

  const colX = {
    date: pageMargin + 8,
    desc: pageMargin + 90,
    cat: pageMargin + 310,
    amt: pageWidth - pageMargin - 88,
  }

  const drawHeader = () => {
    const hH = 22
    drawRect(page, pageMargin, y - hH, pageWidth - pageMargin * 2, hH, {
      fill: BLACK,
    })
    drawText(page, 'DATE', colX.date, y - 15, { mono: true, bold: true, size: 9, color: rgb(1, 1, 1) })
    drawText(page, 'DESCRIPTION', colX.desc, y - 15, { mono: true, bold: true, size: 9, color: rgb(1, 1, 1) })
    drawText(page, 'CATEGORY', colX.cat, y - 15, { mono: true, bold: true, size: 9, color: rgb(1, 1, 1) })
    drawText(page, 'AMOUNT', colX.amt, y - 15, { mono: true, bold: true, size: 9, color: rgb(1, 1, 1) })
    y -= hH
  }

  drawHeader()

  const ensureSpace = () => {
    if (y < pageMargin + lineH * 3) {
      page = pdfDoc.addPage()
      y = page.getHeight() - pageMargin
      drawHeader()
    }
  }

  let rowIndex = 0
  for (const r of input.rows) {
    ensureSpace()
    const rowH = lineH
    // zebra stripe
    if (rowIndex % 2 === 0) {
      drawRect(page, pageMargin, y - rowH, pageWidth - pageMargin * 2, rowH, {
        fill: BG_MUTED,
      })
    }
    drawText(page, r.date, colX.date, y - 11, { mono: true, size: 9 })
    drawText(page, r.description.slice(0, 40), colX.desc, y - 11, { size: 10 })
    drawText(page, r.category.slice(0, 20), colX.cat, y - 11, { size: 10, color: MUTED })
    drawText(page, `${r.amount.toFixed(2)} ${r.currency}`, colX.amt, y - 11, { mono: true, bold: true, size: 10 })
    y -= rowH
    rowIndex++
  }

  // Bottom border
  drawRect(page, pageMargin, y - 2, pageWidth - pageMargin * 2, 2, { fill: BLACK })

  // Footer on every page
  const pages = pdfDoc.getPages()
  pages.forEach((p, idx) => {
    drawText(p, `Generated by Solvio  /  solvio-lac.vercel.app  /  Page ${idx + 1} of ${pages.length}`,
      pageMargin, 20, { mono: true, size: 8, color: MUTED })
  })

  const bytes = await pdfDoc.save()
  return Buffer.from(bytes)
}

export async function buildDocxBuffer(input: DocxInput): Promise<Buffer> {
  const total = input.rows.reduce((s, r) => s + r.amount, 0)
  const currency = input.rows[0]?.currency || ''

  const BORDER = { style: BorderStyle.SINGLE, size: 12, color: '1a1a1a' }
  const TIGHT_BORDER = { style: BorderStyle.SINGLE, size: 8, color: '1a1a1a' }

  const headerCell = (text: string) =>
    new TableCell({
      children: [
        new Paragraph({
          children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 18, font: 'Courier New' })],
          alignment: AlignmentType.LEFT,
        }),
      ],
      shading: { type: ShadingType.CLEAR, fill: '1a1a1a', color: 'auto' },
      borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
    })

  const bodyCell = (text: string, opts: { mono?: boolean; bold?: boolean; align?: typeof AlignmentType[keyof typeof AlignmentType] } = {}) =>
    new TableCell({
      children: [
        new Paragraph({
          children: [new TextRun({
            text,
            bold: opts.bold,
            size: 20,
            font: opts.mono ? 'Courier New' : undefined,
          })],
          alignment: opts.align ?? AlignmentType.LEFT,
        }),
      ],
      borders: { top: TIGHT_BORDER, bottom: TIGHT_BORDER, left: TIGHT_BORDER, right: TIGHT_BORDER },
    })

  const headerRow = new TableRow({
    children: [
      headerCell('DATE'),
      headerCell('DESCRIPTION'),
      headerCell('CATEGORY'),
      headerCell('AMOUNT'),
      headerCell('CUR'),
    ],
  })

  const bodyRows = input.rows.map((r) =>
    new TableRow({
      children: [
        bodyCell(r.date, { mono: true }),
        bodyCell(r.description),
        bodyCell(r.category),
        bodyCell(r.amount.toFixed(2), { mono: true, bold: true, align: AlignmentType.RIGHT }),
        bodyCell(r.currency, { mono: true }),
      ],
    })
  )

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
    borders: {
      top: BORDER,
      bottom: BORDER,
      left: BORDER,
      right: BORDER,
      insideHorizontal: TIGHT_BORDER,
      insideVertical: TIGHT_BORDER,
    },
  })

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Inter' } },
      },
    },
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({ text: '// SOLVIO REPORT', font: 'Courier New', size: 18, color: '666666' }),
            ],
            spacing: { after: 120 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: input.title, bold: true, size: 40 }),
            ],
            spacing: { after: 240 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'TOTAL  ', font: 'Courier New', bold: true, size: 18, color: '666666' }),
              new TextRun({ text: `${total.toFixed(2)} ${currency}`, font: 'Courier New', bold: true, size: 32 }),
              new TextRun({ text: `     ${input.rows.length} ${input.rows.length === 1 ? 'ENTRY' : 'ENTRIES'}`, font: 'Courier New', size: 18, color: '666666' }),
            ],
            spacing: { after: 360 },
          }),
          table,
          new Paragraph({
            children: [
              new TextRun({
                text: `Generated by Solvio  /  solvio-lac.vercel.app  /  ${new Date().toISOString().slice(0, 10)}`,
                font: 'Courier New',
                size: 16,
                color: '999999',
              }),
            ],
            spacing: { before: 480 },
          }),
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
