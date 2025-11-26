// app/api/v1/ocr-receipt/route.ts
import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';

export const runtime = 'nodejs';

/** Docelowy schemat paragonu */
const ReceiptZ = z.object({
  vendor: z.string().nullable().optional(),
  date: z.string().nullable().optional(), // ISO YYYY-MM-DD
  currency: z.string().nullable().optional(), // ISO 4217
  total: z.number().nullable().optional(),
  items: z
    .array(
      z.object({
        name: z.string(),
        quantity: z.number().nullable().optional(),
        price: z.number().nullable().optional(),
      })
    )
    .default([]),
  ocrText: z.string().default(''),
});
type Receipt = z.infer<typeof ReceiptZ>;

type OcrResponse = {
  receipt_id: string;
  ocrText: string;
  parsed?: Receipt;
  provider: string;
  warnings?: string[];
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: 'Invalid multipart payload' }, 400);
  }

  const receiptId = form.get('receiptId');
  const userId = form.get('userId');
  const files = form.getAll('files') as File[];

  if (typeof receiptId !== 'string' || typeof userId !== 'string') {
    return json({ error: 'Missing receiptId or userId' }, 400);
  }
  if (!files.length) {
    return json({ error: 'No files provided' }, 400);
  }

  const warnings: string[] = [];
  const texts: string[] = [];
  const receipts: Receipt[] = [];
  let provider = 'openai:gpt-4o-2024-08-06';

  for (const f of files) {
    try {
      const ab = await f.arrayBuffer();
      const buffer = Buffer.from(ab);
      const res = await processImage({
        buffer,
        filename: f.name,
        mime: f.type,
      });
      if (res?.ocrText) texts.push(res.ocrText);
      if (res?.parsed) receipts.push(res.parsed);
      if (res?.provider) provider = res.provider;
      if (res?.warnings?.length) warnings.push(...res.warnings);
    } catch (e: any) {
      warnings.push(`processImage failed for ${f.name}: ${e?.message || e}`);
    }
  }

  const picked = receipts.find(
    (r) => typeof r.total === 'number' && !Number.isNaN(r.total)
  ) ??
    receipts[0] ?? {
      vendor: null,
      date: null,
      total: null,
      currency: null,
      items: [],
      ocrText: '',
    };

  const payload: OcrResponse = {
    receipt_id: receiptId,
    ocrText: texts.join('\n---\n'),
    parsed: picked,
    provider,
    warnings,
  };

  return json(payload, 200);
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** OCR+parsowanie jednym wywołaniem (Chat Completions + Structured Outputs) */
async function processImage(opts: {
  buffer: Buffer;
  filename: string;
  mime: string;
}): Promise<OcrResponse> {
  const { buffer, mime } = opts;

  if (!/^image\//i.test(mime)) {
    return {
      receipt_id: 'unknown',
      ocrText: '',
      parsed: {
        vendor: null,
        date: null,
        total: null,
        currency: null,
        items: [],
        ocrText: '',
      },
      provider: 'openai:gpt-4o-2024-08-06',
      warnings: ['Unsupported MIME, only images are processed'],
    };
  }

  const b64 = buffer.toString('base64');
  const dataUrl = `data:${mime};base64,${b64}`;

  const completion = await openai.chat.completions.parse({
    model: 'gpt-4o-2024-08-06', // model z obsługą obrazów
    temperature: 0,
    response_format: zodResponseFormat(ReceiptZ, 'receipt'),
    messages: [
      {
        role: 'system',
        content:
          'You are an OCR and receipt parser. Return a single JSON object named "receipt" that matches the schema exactly. ' +
          'Extract full OCR text into ocrText. Normalize date to YYYY-MM-DD. Use dot decimal and ISO 4217 currency codes.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract structured receipt fields and the full OCR text from this image.',
          },
          // KLUCZOWA ZMIANA: używamy "image_url", NIE "input_image"
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
  });

  const parsed = completion.choices[0]?.message?.parsed as Receipt | undefined;

  if (!parsed) {
    return {
      receipt_id: 'unknown',
      ocrText: '',
      parsed: {
        vendor: null,
        date: null,
        total: null,
        currency: null,
        items: [],
        ocrText: '',
      },
      provider: 'openai:gpt-4o-2024-08-06',
      warnings: ['No parsed payload returned'],
    };
  }

  return {
    receipt_id: 'unknown',
    ocrText: parsed.ocrText ?? '',
    parsed,
    provider: 'openai:gpt-4o-2024-08-06',
    warnings: [],
  };
}
