/**
 * Parametry wywołania czatu zależne od rodziny modelu.
 *
 * Modele rozumujące (gpt-5.x, o1/o3/o4) różnią się od gpt-4.x w dwóch
 * miejscach, które cicho psują wynik:
 *
 *  1. `temperature` inne niż 1 jest ODRZUCANE — call site „stroi" parametr,
 *     który nic nie robi, albo dostaje 400.
 *  2. Tokeny rozumowania liczą się do `max_completion_tokens`. Przy ciasnym
 *     limicie cały budżet schodzi na myślenie, a `content` wraca pusty albo
 *     ucięty w połowie JSON-a (`finish_reason: "length"`). Dlatego wymuszamy
 *     `reasoning_effort: "minimal"` wszędzie, gdzie zadaniem jest przepisanie
 *     danych, a nie myślenie.
 *
 * Klasa błędu potwierdzona na produkcji Estalo (generator maili zwracał sam
 * temat bez treści). Tutaj dotyczy odczytu paragonu — pusty content znaczy
 * „paragon nieczytelny", więc awaria wygląda jak zła jakość zdjęcia.
 */

export type JsonFormat =
  | { type: 'json_object' }
  | { type: 'json_schema'; json_schema: { name: string; strict: true; schema: Record<string, unknown> } }

export interface ChatParamsInput {
  model: string
  maxTokens: number
  /** Ignorowane dla modeli rozumujących — one przyjmują wyłącznie 1. */
  temperature?: number
  json?: JsonFormat
}

/** `true` dla rodzin, które liczą tokeny rozumowania do limitu odpowiedzi. */
export function isReasoningModel(model: string): boolean {
  const m = model.toLowerCase()
  return /(^|[/_-])(gpt-5|o1|o3|o4)/.test(m)
}

/**
 * Buduje część parametrów wspólną dla wszystkich wywołań czatu. Reszta
 * (`messages`) dochodzi w call site.
 */
export function chatParams(input: ChatParamsInput): Record<string, unknown> {
  const { model, maxTokens, temperature = 0, json } = input
  const base: Record<string, unknown> = { model }
  if (json) base.response_format = json

  if (isReasoningModel(model)) {
    base.max_completion_tokens = maxTokens
    // Rodziny różnią się słownikiem: gpt-5/o-series znają 'minimal',
    // gpt-5.1+ zamiast tego 'none'. Zły wyraz to 400, więc `chatWithEffortRetry`
    // podnosi wartość z komunikatu błędu i ponawia.
    base.reasoning_effort = 'minimal'
  } else {
    base.max_tokens = maxTokens
    base.temperature = temperature
  }
  return base
}

/**
 * Wyciąga treść odpowiedzi i mówi wprost, gdy model urwał się na limicie.
 * Bez tego ucięty JSON wraca jako „nie udało się sparsować", co prowadzi
 * diagnostykę w złą stronę — problemem jest budżet tokenów, nie prompt.
 */
export function readContent(completion: {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>
}): { text: string; truncated: boolean } {
  const choice = completion.choices?.[0]
  const text = choice?.message?.content?.trim() ?? ''
  return { text, truncated: choice?.finish_reason === 'length' }
}

type ChatCreate = (params: Record<string, unknown>) => Promise<unknown>

/**
 * Wywołanie czatu odporne na rozjazd słownika `reasoning_effort`.
 *
 * OpenAI zmienia dopuszczalne wartości między rodzinami modeli (gpt-5:
 * `minimal`, gpt-5.1+: `none`) i odrzuca nieznaną wartość błędem 400 —
 * a lista dopuszczalnych wartości jest W TREŚCI tego błędu. Zamiast
 * utrzymywać u siebie tabelę, która i tak się zestarzeje, bierzemy pierwszą
 * z podanych i ponawiamy raz.
 */
export async function chatWithEffortRetry<T>(create: ChatCreate, params: Record<string, unknown>): Promise<T> {
  try {
    return await create(params) as T
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!params.reasoning_effort || !/reasoning_effort/.test(message)) throw err
    const supported = message.match(/Supported values are:([^.]*)/i)?.[1]
    const first = supported?.match(/'([a-z]+)'/)?.[1]
    if (!first) throw err
    return await create({ ...params, reasoning_effort: first }) as T
  }
}
