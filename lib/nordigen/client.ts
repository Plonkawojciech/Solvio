// ══════════════════════════════════════════════════════════════════════════════
// GoCardless Bank Account Data (Nordigen) API Client
// Replaces direct PKO PSD2 integration — provides access to 2400+ EU banks
// ══════════════════════════════════════════════════════════════════════════════

const BASE_URL = 'https://bankaccountdata.gocardless.com/api/v2'

// ── Types ────────────────────────────────────────────────────────────────────

export interface NordigenToken {
  access: string
  access_expires: number // seconds
  refresh: string
  refresh_expires: number // seconds
}

export interface Institution {
  id: string
  name: string
  bic: string
  transaction_total_days: string
  countries: string[]
  logo: string
}

export interface Requisition {
  id: string
  created: string
  redirect: string
  status: string // CR, LN, RJ, ER, SA, GA, EX
  institution_id: string
  agreement: string
  reference: string
  accounts: string[]
  user_language: string
  link: string
  ssn: string | null
  account_selection: boolean
  redirect_immediate: boolean
}

export interface AccountMetadata {
  id: string
  created: string
  last_accessed: string
  iban: string
  institution_id: string
  status: string // DISCOVERED, PROCESSING, ERROR, EXPIRED, READY, SUSPENDED
  owner_name: string
}

export interface AccountDetails {
  resourceId: string
  iban: string
  currency: string
  ownerName?: string
  name?: string
  product?: string
  cashAccountType?: string
}

export interface AccountBalance {
  balanceAmount: {
    amount: string
    currency: string
  }
  balanceType: string // closingBooked, expected, interimAvailable, etc.
  referenceDate?: string
}

export interface NordigenTransaction {
  transactionId?: string
  internalTransactionId?: string
  bookingDate?: string
  valueDate?: string
  transactionAmount: {
    amount: string
    currency: string
  }
  creditorName?: string
  creditorAccount?: { iban?: string }
  debtorName?: string
  debtorAccount?: { iban?: string }
  remittanceInformationUnstructured?: string
  remittanceInformationUnstructuredArray?: string[]
  remittanceInformationStructured?: string
  bankTransactionCode?: string
  merchantCategoryCode?: string
  proprietaryBankTransactionCode?: string
  additionalInformation?: string
}

export interface TransactionsResponse {
  transactions: {
    booked: NordigenTransaction[]
    pending: NordigenTransaction[]
  }
}

export interface EndUserAgreement {
  id: string
  created: string
  max_historical_days: number
  access_valid_for_days: number
  access_scope: string[]
  accepted: string | null
  institution_id: string
}

export class NordigenApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public responseBody?: unknown,
  ) {
    super(message)
    this.name = 'NordigenApiError'
  }
}

// ── Token Cache ──────────────────────────────────────────────────────────────

let cachedToken: { access: string; expiresAt: number; refresh: string; refreshExpiresAt: number } | null = null

// ── Client ───────────────────────────────────────────────────────────────────

class NordigenClient {
  private secretId: string
  private secretKey: string

  constructor(secretId: string, secretKey: string) {
    this.secretId = secretId
    this.secretKey = secretKey
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now()

    // Return cached token if still valid (with 60s buffer)
    if (cachedToken && cachedToken.expiresAt > now + 60_000) {
      return cachedToken.access
    }

    // Try refresh if we have a valid refresh token
    if (cachedToken && cachedToken.refreshExpiresAt > now + 60_000) {
      try {
        const res = await fetch(`${BASE_URL}/token/refresh/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh: cachedToken.refresh }),
        })
        if (res.ok) {
          const data = await res.json() as { access: string; access_expires: number }
          cachedToken = {
            ...cachedToken,
            access: data.access,
            expiresAt: now + data.access_expires * 1000,
          }
          return cachedToken.access
        }
      } catch {
        // Fall through to full token request
      }
    }

    // Get new token pair
    const res = await fetch(`${BASE_URL}/token/new/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret_id: this.secretId,
        secret_key: this.secretKey,
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new NordigenApiError(
        `Failed to get access token: ${res.status}`,
        res.status,
        body,
      )
    }

    const token = await res.json() as NordigenToken
    cachedToken = {
      access: token.access,
      expiresAt: now + token.access_expires * 1000,
      refresh: token.refresh,
      refreshExpiresAt: now + token.refresh_expires * 1000,
    }

    return cachedToken.access
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await this.getAccessToken()

    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new NordigenApiError(
        `Nordigen API error: ${res.status} ${path}`,
        res.status,
        body,
      )
    }

    return res.json() as Promise<T>
  }

  // ── Institutions ──────────────────────────────────────────────────────────

  async getInstitutions(country: string = 'pl'): Promise<Institution[]> {
    return this.request<Institution[]>(`/institutions/?country=${country}`)
  }

  async getInstitution(id: string): Promise<Institution> {
    return this.request<Institution>(`/institutions/${id}/`)
  }

  // ── End User Agreements ───────────────────────────────────────────────────

  async createAgreement(opts: {
    institution_id: string
    max_historical_days?: number
    access_valid_for_days?: number
    access_scope?: string[]
  }): Promise<EndUserAgreement> {
    return this.request<EndUserAgreement>('/agreements/enduser/', {
      method: 'POST',
      body: JSON.stringify({
        institution_id: opts.institution_id,
        max_historical_days: opts.max_historical_days ?? 90,
        access_valid_for_days: opts.access_valid_for_days ?? 90,
        access_scope: opts.access_scope ?? ['balances', 'details', 'transactions'],
      }),
    })
  }

  // ── Requisitions ──────────────────────────────────────────────────────────

  async createRequisition(opts: {
    redirect: string
    institution_id: string
    reference: string
    agreement?: string
    user_language?: string
  }): Promise<Requisition> {
    return this.request<Requisition>('/requisitions/', {
      method: 'POST',
      body: JSON.stringify({
        redirect: opts.redirect,
        institution_id: opts.institution_id,
        reference: opts.reference,
        agreement: opts.agreement ?? '',
        user_language: opts.user_language ?? 'PL',
        account_selection: false,
        redirect_immediate: false,
      }),
    })
  }

  async getRequisition(id: string): Promise<Requisition> {
    return this.request<Requisition>(`/requisitions/${id}/`)
  }

  async deleteRequisition(id: string): Promise<void> {
    await this.request(`/requisitions/${id}/`, { method: 'DELETE' })
  }

  // ── Accounts ──────────────────────────────────────────────────────────────

  async getAccountMetadata(accountId: string): Promise<AccountMetadata> {
    return this.request<AccountMetadata>(`/accounts/${accountId}/`)
  }

  async getAccountDetails(accountId: string): Promise<{ account: AccountDetails }> {
    return this.request<{ account: AccountDetails }>(`/accounts/${accountId}/details/`)
  }

  async getAccountBalances(accountId: string): Promise<{ balances: AccountBalance[] }> {
    return this.request<{ balances: AccountBalance[] }>(`/accounts/${accountId}/balances/`)
  }

  async getAccountTransactions(
    accountId: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<TransactionsResponse> {
    let path = `/accounts/${accountId}/transactions/`
    const params: string[] = []
    if (dateFrom) params.push(`date_from=${dateFrom}`)
    if (dateTo) params.push(`date_to=${dateTo}`)
    if (params.length > 0) path += `?${params.join('&')}`

    return this.request<TransactionsResponse>(path)
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let _client: NordigenClient | null = null

export function getNordigenClient(): NordigenClient {
  if (_client) return _client

  const secretId = process.env.GOCARDLESS_SECRET_ID
  const secretKey = process.env.GOCARDLESS_SECRET_KEY

  if (!secretId || !secretKey) {
    throw new Error(
      'Missing GoCardless credentials: set GOCARDLESS_SECRET_ID and GOCARDLESS_SECRET_KEY environment variables',
    )
  }

  _client = new NordigenClient(secretId, secretKey)
  return _client
}
