import OpenAI, { AzureOpenAI } from 'openai'

const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT
const AZURE_KEY = process.env.AZURE_OPENAI_API_KEY
const AZURE_API_VERSION = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21'
const AZURE_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT
const OPENAI_KEY = process.env.OPENAI_API_KEY

type Backend = 'azure' | 'openai'

type AIClient = {
  client: OpenAI | AzureOpenAI
  backend: Backend
  model: string
}

let cached: AIClient | null = null

function build(): AIClient | null {
  if (AZURE_ENDPOINT && AZURE_KEY && AZURE_DEPLOYMENT) {
    const rawClient = new AzureOpenAI({
      endpoint: AZURE_ENDPOINT,
      apiKey: AZURE_KEY,
      apiVersion: AZURE_API_VERSION,
      deployment: AZURE_DEPLOYMENT,
    })
    // Patch chat.completions.create so callers can keep using `max_tokens`
    // even when the deployed model (gpt-5.x, o-series) requires `max_completion_tokens`.
    const origCreate = rawClient.chat.completions.create.bind(rawClient.chat.completions)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawClient.chat.completions.create = (async (params: any, opts?: any) => {
      if (params && typeof params === 'object' && 'max_tokens' in params && !('max_completion_tokens' in params)) {
        const { max_tokens, ...rest } = params
        try {
          return await origCreate({ ...rest, max_tokens }, opts)
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : ''
          if (/max_tokens|max_completion_tokens|unsupported_parameter/i.test(msg)) {
            return await origCreate({ ...rest, max_completion_tokens: max_tokens }, opts)
          }
          throw err
        }
      }
      return origCreate(params, opts)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
    return { client: rawClient, backend: 'azure', model: AZURE_DEPLOYMENT }
  }

  if (OPENAI_KEY) {
    const client = new OpenAI({ apiKey: OPENAI_KEY })
    return { client, backend: 'openai', model: 'gpt-4o-mini' }
  }

  return null
}

export function getAIClient(): AIClient | null {
  if (cached) return cached
  cached = build()
  return cached
}

let webSearchCached: AIClient | null = null

/**
 * Returns an OpenAI-direct client even when Azure env vars are set,
 * because **Azure does NOT support the Responses API / web_search_preview
 * tool**. Routes that depend on live web data (promotions, shopping list
 * optimizer, audit, prices) must call this — the default `getAIClient()`
 * prefers Azure for cost, but Azure can only do plain chat completions
 * which means the model hallucinates "current week's promotions" from
 * training data.
 *
 * Returns null if `OPENAI_API_KEY` is not configured. Callers should
 * fall back to `getAIClient()` and accept lower data quality, or
 * surface an error to the user explaining that promotions/audits need
 * live data.
 */
export function getAIClientForWebSearch(): AIClient | null {
  if (webSearchCached) return webSearchCached
  if (!OPENAI_KEY) return null
  const client = new OpenAI({ apiKey: OPENAI_KEY })
  webSearchCached = { client, backend: 'openai', model: 'gpt-4o-mini' }
  return webSearchCached
}

export function hasAI(): boolean {
  return getAIClient() !== null
}

export function hasWebSearchAI(): boolean {
  return getAIClientForWebSearch() !== null
}
