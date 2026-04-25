import { auth } from '@/lib/auth-compat'
import { NextResponse } from 'next/server'
import { getAIClient } from '@/lib/ai-client'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // SECURITY FIX: Rate limit AI endpoint to prevent cost abuse
  const rl = rateLimit(`ai:${userId}`, { maxRequests: 10, windowMs: 3600000 })
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } })

  const ai = getAIClient()
  if (!ai) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
  }

  try {
    const { items, members, context, lang = 'en' } = await request.json()

    if (!items?.length || !members?.length) {
      return NextResponse.json({ error: 'Items and members are required' }, { status: 400 })
    }

    const isPolish = lang === 'pl'
    const langInstruction = isPolish
      ? 'Odpowiadaj WYŁĄCZNIE po polsku. Rozumiesz polskie nazwy produktów (np. "Piwo" = alkohol, "Sok" = bezalkoholowe, "Zupka" = zupa).'
      : 'Respond ONLY in English. You understand Polish product names (e.g. "Piwo" = beer/alcohol, "Sok" = juice/non-alcoholic, "Zupka" = soup).'

    const prompt = `You are a smart expense-splitting assistant. Given receipt items and group members, suggest how to assign items to people.

${langInstruction}

ITEMS:
${items.map((item: { name: string; price: number }, i: number) => `${i}. "${item.name}" — ${item.price}`).join('\n')}

MEMBERS:
${members.map((m: { name: string }) => `- ${m.name}`).join('\n')}

${context ? `CONTEXT: ${context}` : ''}

RULES:
- If an item looks like alcohol (beer, wine, vodka, piwo, wino, wódka), suggest only adults/likely drinkers
- If an item is a kids meal or children-specific, suggest parents pay
- Shared items (bread, water, appetizers, etc.) should be split equally
- Fuel/tolls should be split between car passengers
- If unclear, default to equal split among all members
- Be smart about Polish product names

Return ONLY valid JSON (no markdown, no extra text):
{
  "suggestions": [
    { "itemIndex": 0, "memberNames": ["Name1", "Name2"], "reason": "brief reason" }
  ],
  "summary": "1-2 sentence summary of the suggested split"
}`

    const completion = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0]?.message?.content || '{}'
    const parsed = JSON.parse(raw)

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('[groups/ai-suggest] error:', err)
    return NextResponse.json(
      { error: 'Failed to generate AI suggestions' },
      { status: 500 }
    )
  }
}
