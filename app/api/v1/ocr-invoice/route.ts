// app/api/v1/ocr-invoice/route.ts - Azure Document Intelligence Invoice OCR
import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth-compat'
import { db } from '@/lib/db'
import { invoices, companyMembers, vatEntries, userSettings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { put } from '@vercel/blob'

export const runtime = 'nodejs'
export const maxDuration = 60

const AZURE_ENDPOINT = process.env.AZURE_OCR_ENDPOINT
const AZURE_KEY = process.env.AZURE_OCR_KEY

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function processAzureInvoiceOCR(buffer: Buffer, mimeType: string) {
  if (!AZURE_ENDPOINT || !AZURE_KEY) {
    throw new Error('AZURE_OCR_ENDPOINT or AZURE_OCR_KEY not configured')
  }

  // Use prebuilt-invoice model instead of prebuilt-receipt
  const analyzeUrl = `${AZURE_ENDPOINT}formrecognizer/documentModels/prebuilt-invoice:analyze?api-version=2023-07-31`

  const postResponse = await fetch(analyzeUrl, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': AZURE_KEY,
      'Content-Type': mimeType,
    },
    body: new Uint8Array(buffer),
  })

  if (!postResponse.ok) {
    const errorText = await postResponse.text()
    throw new Error(`Azure POST failed: ${postResponse.status} - ${errorText}`)
  }

  const operationLocation = postResponse.headers.get('Operation-Location')
  if (!operationLocation) {
    throw new Error('Azure did not return Operation-Location header')
  }

  // Polling for result
  let attempts = 0
  const maxAttempts = 50

  while (attempts < maxAttempts) {
    attempts++
    await new Promise(resolve => setTimeout(resolve, 1000))

    const getResponse = await fetch(operationLocation, {
      method: 'GET',
      headers: { 'Ocp-Apim-Subscription-Key': AZURE_KEY },
    })

    if (!getResponse.ok) {
      const errorText = await getResponse.text()
      throw new Error(`Azure GET failed: ${getResponse.status} - ${errorText}`)
    }

    const result = await getResponse.json()

    if (result.status === 'succeeded') {
      return result
    }

    if (result.status === 'failed') {
      throw new Error(`Azure OCR failed: ${JSON.stringify(result.error || result)}`)
    }
  }

  throw new Error('Azure OCR timeout')
}

function extractInvoiceData(azureResult: any) {
  const document = azureResult.analyzeResult?.documents?.[0]
  if (!document) {
    throw new Error('No document found in Azure result')
  }

  const fields = document.fields || {}

  // Extract vendor info
  const vendorName = fields.VendorName?.content || fields.VendorName?.valueString || null
  const vendorNip = fields.VendorTaxId?.content || fields.VendorTaxId?.valueString || null
  const vendorAddress = fields.VendorAddress?.content || null

  // Extract buyer info
  const buyerName = fields.CustomerName?.content || fields.CustomerName?.valueString || null
  const buyerNip = fields.CustomerTaxId?.content || fields.CustomerTaxId?.valueString || null

  // Extract dates
  const issueDate = fields.InvoiceDate?.valueDate || fields.InvoiceDate?.content || null
  const dueDate = fields.DueDate?.valueDate || fields.DueDate?.content || null

  // Extract invoice number
  const invoiceNumber = fields.InvoiceId?.content || fields.InvoiceId?.valueString || null

  // Extract amounts
  const subtotal = fields.SubTotal?.valueNumber ?? null
  const totalTax = fields.TotalTax?.valueNumber ?? null
  const invoiceTotal = fields.InvoiceTotal?.valueNumber ?? fields.AmountDue?.valueNumber ?? null

  let netAmount = subtotal
  let vatAmount = totalTax
  let grossAmount = invoiceTotal

  // Calculate missing values
  if (netAmount && vatAmount && !grossAmount) {
    grossAmount = netAmount + vatAmount
  } else if (grossAmount && vatAmount && !netAmount) {
    netAmount = grossAmount - vatAmount
  } else if (grossAmount && netAmount && !vatAmount) {
    vatAmount = grossAmount - netAmount
  } else if (grossAmount && !netAmount && !vatAmount) {
    // Assume 23% VAT
    netAmount = grossAmount / 1.23
    vatAmount = grossAmount - netAmount
  }

  // Extract currency
  const currency = fields.InvoiceTotal?.valueCurrency?.currencyCode ||
                    fields.SubTotal?.valueCurrency?.currencyCode || 'PLN'

  // Extract items
  const items: Array<{
    name: string
    quantity: number
    unit: string
    unitPrice: number
    netAmount: number
    vatRate: string
    vatAmount: number
    grossAmount: number
  }> = []

  const itemsField = fields.Items?.valueArray
  if (itemsField && Array.isArray(itemsField)) {
    for (const item of itemsField) {
      const itemObj = item.valueObject || {}

      const name = itemObj.Description?.content ||
                   itemObj.Description?.valueString ||
                   itemObj.ProductCode?.content ||
                   'Pozycja'

      const quantity = itemObj.Quantity?.valueNumber ?? 1
      const unit = itemObj.Unit?.content || itemObj.Unit?.valueString || 'szt.'
      const unitPrice = itemObj.UnitPrice?.valueNumber ?? 0
      const amount = itemObj.Amount?.valueNumber ?? (quantity * unitPrice)
      const tax = itemObj.Tax?.valueNumber ?? (amount * 0.23)

      items.push({
        name,
        quantity,
        unit,
        unitPrice,
        netAmount: amount,
        vatRate: '23%', // Default, could be extracted from individual items
        vatAmount: tax,
        grossAmount: amount + tax,
      })
    }
  }

  // Try to detect VAT rate from amounts
  let vatRate = '23%'
  if (netAmount && vatAmount) {
    const ratio = vatAmount / netAmount
    if (Math.abs(ratio - 0.23) < 0.02) vatRate = '23%'
    else if (Math.abs(ratio - 0.08) < 0.02) vatRate = '8%'
    else if (Math.abs(ratio - 0.05) < 0.02) vatRate = '5%'
    else if (Math.abs(ratio) < 0.01) vatRate = '0%'
  }

  // Try to detect split payment
  const rawContent = azureResult.analyzeResult?.content || ''
  const splitPayment = /mechanizm\s+podzielonej\s+p[lł]atno[śs]ci|split\s*payment|mpp/i.test(rawContent)

  // Try to detect payment method
  let paymentMethod: string | null = null
  if (/przelew|transfer/i.test(rawContent)) paymentMethod = 'transfer'
  else if (/got[oó]wka|cash/i.test(rawContent)) paymentMethod = 'cash'
  else if (/karta|card/i.test(rawContent)) paymentMethod = 'card'

  return {
    invoiceNumber,
    vendorName,
    vendorNip: vendorNip ? vendorNip.replace(/[^0-9]/g, '') : null,
    vendorAddress,
    buyerName,
    buyerNip: buyerNip ? buyerNip.replace(/[^0-9]/g, '') : null,
    issueDate,
    dueDate,
    netAmount,
    vatAmount,
    grossAmount,
    vatRate,
    currency,
    items,
    splitPayment,
    paymentMethod,
  }
}

export async function POST(req: NextRequest) {
  console.log('[OCR-Invoice] Request received')

  const { userId } = await auth()
  if (!userId) return json({ error: 'Unauthorized' }, 401)

  // Verify business user
  const settings = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1)
  if (!settings[0] || settings[0].productType !== 'business') {
    return json({ error: 'Business account required' }, 403)
  }

  if (!AZURE_ENDPOINT || !AZURE_KEY) {
    return json({ error: 'Azure OCR not configured' }, 500)
  }

  try {
    const form = await req.formData()
    const file = form.get('file') as File

    if (!file) {
      return json({ error: 'No file provided' }, 400)
    }

    if (file.size === 0) {
      return json({ error: 'File is empty' }, 400)
    }

    if (file.size > 10 * 1024 * 1024) {
      return json({ error: 'File too large (max 10MB)' }, 400)
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // Determine MIME type
    let mimeType = file.type || 'image/jpeg'
    const fileName = file.name.toLowerCase()
    if (!mimeType || mimeType === 'application/octet-stream') {
      if (fileName.match(/\.(jpg|jpeg)$/)) mimeType = 'image/jpeg'
      else if (fileName.match(/\.png$/)) mimeType = 'image/png'
      else if (fileName.match(/\.pdf$/)) mimeType = 'application/pdf'
      else mimeType = 'image/jpeg'
    }

    // Upload to Blob
    let imageUrl: string | null = null
    try {
      const blobResult = await put(`invoices/${userId}/${Date.now()}_${file.name}`, buffer, {
        access: 'public',
        contentType: mimeType,
      })
      imageUrl = blobResult.url
    } catch (blobErr) {
      console.warn('[OCR-Invoice] Blob upload failed (non-fatal):', blobErr)
    }

    // Azure OCR
    const azureResult = await processAzureInvoiceOCR(buffer, mimeType)
    const data = extractInvoiceData(azureResult)

    // Get user's company
    const memberResult = await db.select({ companyId: companyMembers.companyId })
      .from(companyMembers)
      .where(eq(companyMembers.userId, userId))
      .limit(1)

    const companyId = memberResult[0]?.companyId || null

    // Save invoice to database
    const [invoice] = await db.insert(invoices).values({
      userId,
      companyId,
      invoiceNumber: data.invoiceNumber,
      vendorName: data.vendorName,
      vendorNip: data.vendorNip,
      buyerName: data.buyerName,
      buyerNip: data.buyerNip,
      issueDate: data.issueDate,
      dueDate: data.dueDate,
      netAmount: data.netAmount ? String(data.netAmount.toFixed(2)) : null,
      vatAmount: data.vatAmount ? String(data.vatAmount.toFixed(2)) : null,
      grossAmount: data.grossAmount ? String(data.grossAmount.toFixed(2)) : null,
      vatRate: data.vatRate,
      currency: data.currency,
      splitPayment: data.splitPayment,
      paymentMethod: data.paymentMethod,
      imageUrl,
      rawOcr: azureResult,
      items: data.items.length > 0 ? data.items : null,
      status: 'pending',
      submittedBy: userId,
    }).returning()

    // Auto-create VAT entry if company exists and we have amounts
    if (companyId && data.netAmount && data.vatAmount && data.issueDate) {
      const period = data.issueDate.slice(0, 7)
      try {
        await db.insert(vatEntries).values({
          companyId,
          userId,
          invoiceId: invoice.id,
          type: 'input', // Purchase invoice = VAT input
          period,
          netAmount: String(data.netAmount.toFixed(2)),
          vatAmount: String(data.vatAmount.toFixed(2)),
          vatRate: data.vatRate,
          counterpartyName: data.vendorName,
          counterpartyNip: data.vendorNip,
          documentNumber: data.invoiceNumber,
          documentDate: data.issueDate,
          deductible: true,
        })
        console.log('[OCR-Invoice] VAT entry auto-created')
      } catch (vatErr) {
        console.warn('[OCR-Invoice] VAT entry creation failed (non-fatal):', vatErr)
      }
    }

    return json({
      success: true,
      invoice,
      extractedData: data,
    })
  } catch (err) {
    console.error('[OCR-Invoice] Error:', err)
    return json({
      error: err instanceof Error ? err.message : 'Unknown error',
      success: false,
    }, 500)
  }
}
