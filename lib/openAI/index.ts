import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🧩 Definicja schematu danych w Zod
const ReceiptSchema = z.object({
  store: z.string().describe('Nazwa sklepu'),
  address: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  items: z.array(
    z.object({
      name: z.string().describe('Nazwa produktu'),
      quantity: z.number().nullable().optional().describe('Ilość'),
      price: z.number().nullable().optional().describe('Cena za sztukę'),
    })
  ),
  total: z.number().nullable().describe('Łączna kwota paragonu'),
});

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return NextResponse.json({ error: 'Brak pliku' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64Image = `data:${file.type};base64,${buffer.toString('base64')}`;

  // 🧠 Wywołanie modelu z structured output opartym o Zod schema
  const response = await openai.responses.create({
    model: 'gpt-4o-mini',
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `
Odczytaj dane z tego paragonu i dopasuj je do schematu danych.
Jeśli coś jest nieczytelne, wpisz null.
Zwróć poprawny JSON w dokładnej strukturze.`,
          },
          {
            type: 'input_image',
            image_url: base64Image,
          },
        ],
      },
    ],
    // ✨ Kluczowa część — przekazujemy schemat Zod
    structured_output: ReceiptSchema,
  });

  // response.output_parsed ma już poprawny typ
  const data = response.output_parsed;

  return NextResponse.json(data);
}
