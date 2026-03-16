// ══════════════════════════════════════════════════════════════════════════════
// PKO PSD2 API Client — Polish API v2.1.1
// ══════════════════════════════════════════════════════════════════════════════

import * as crypto from 'crypto'
import type {
  RegistrationRequest,
  RegistrationResponse,
  AuthorizeRequest,
  AuthorizeResponse,
  TokenRequest,
  TokenResponse,
  AccountsRequest,
  AccountsResponse,
  AccountInfoRequest,
  AccountResponse,
  TransactionInfoRequest,
  TransactionsDoneInfoResponse,
  TransactionPendingInfoResponse,
  TransactionDetailRequest,
  TransactionDetailResponse,
  HoldRequest,
  HoldInfoResponse,
  DeleteConsentRequest,
  PaymentDomesticRequest,
  PaymentsResponse,
  PaymentRequest,
  GetPaymentResponse,
  ConfirmationOfFundsRequest,
  ConfirmationOfFundsResponse,
  PkoApiErrorResponse,
  ScopeDetailsInput,
  RequestHeaderWithoutTokenAS,
  RequestHeaderAIS,
  RequestHeaderAISCallback,
  RequestHeaderCallback,
  RequestHeaderWithoutToken,
  RequestHeader,
  ScopeType,
} from './types'

// ── Error Class ────────────────────────────────────────────────────────────────

export class PkoApiError extends Error {
  public readonly statusCode: number
  public readonly errorCode?: string
  public readonly responseBody?: PkoApiErrorResponse

  constructor(
    message: string,
    statusCode: number,
    errorCode?: string,
    responseBody?: PkoApiErrorResponse,
  ) {
    super(message)
    this.name = 'PkoApiError'
    this.statusCode = statusCode
    this.errorCode = errorCode
    this.responseBody = responseBody
  }
}

// ── Client ─────────────────────────────────────────────────────────────────────

export class PkoPsd2Client {
  private baseUrl: string
  private clientId: string
  private clientSecret: string
  private signingKey: crypto.KeyObject | null = null

  constructor(config: {
    baseUrl: string
    clientId: string
    clientSecret: string
    signingKeyPem?: string
  }) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret

    if (config.signingKeyPem) {
      this.signingKey = crypto.createPrivateKey(config.signingKeyPem)
    }
  }

  // ── Utility Methods ──────────────────────────────────────────────────────────

  private generateRequestId(): string {
    // UUID v1-like format required by PKO: variant 1, version 1
    // The regex pattern in the spec: ^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[1][0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$
    const bytes = crypto.randomBytes(16)
    // Set version 1
    bytes[6] = (bytes[6]! & 0x0f) | 0x10
    // Set variant (10xx)
    bytes[8] = (bytes[8]! & 0x3f) | 0x80
    const hex = bytes.toString('hex')
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32),
    ].join('-')
  }

  /**
   * Create a detached JWS signature of the request body.
   * Uses RS256 with the configured signing key.
   * Detached JWS: header..signature (payload removed from compact serialization).
   */
  private signRequest(body: string): string {
    if (!this.signingKey) {
      // If no signing key configured, return empty signature.
      // In production, this MUST be configured.
      console.warn('[PkoPsd2Client] No signing key configured — JWS signature will be empty')
      return ''
    }

    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
    ).toString('base64url')

    const payload = Buffer.from(body).toString('base64url')

    const signatureInput = `${header}.${payload}`
    const signature = crypto
      .createSign('RSA-SHA256')
      .update(signatureInput)
      .sign(this.signingKey, 'base64url')

    // Detached JWS: header..signature (no payload in the middle)
    return `${header}..${signature}`
  }

  /**
   * Make a POST request to the PKO PSD2 API with all required headers.
   */
  private async makeRequest<T>(
    path: string,
    body: Record<string, unknown>,
    options: {
      accessToken?: string
      expectStatus?: number
      expectNoContent?: boolean
    } = {},
  ): Promise<T> {
    const { accessToken, expectStatus = 200, expectNoContent = false } = options

    const bodyStr = JSON.stringify(body)
    const requestId = (body.requestHeader as Record<string, unknown> | undefined)?.requestId as string | undefined
      ?? this.generateRequestId()

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'Accept-Language': 'pl',
      'Accept-Charset': 'utf-8',
      'X-JWS-SIGNATURE': this.signRequest(bodyStr),
      'X-REQUEST-ID': requestId,
    }

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }

    const url = `${this.baseUrl}${path}`

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: bodyStr,
      })
    } catch (err) {
      throw new PkoApiError(
        `Network error calling PKO API: ${err instanceof Error ? err.message : String(err)}`,
        0,
      )
    }

    if (expectNoContent && response.status === 204) {
      return {} as T
    }

    if (response.status !== expectStatus) {
      let errorBody: PkoApiErrorResponse | undefined
      try {
        errorBody = (await response.json()) as PkoApiErrorResponse
      } catch {
        // Could not parse error body
      }

      throw new PkoApiError(
        errorBody?.message ?? `PKO API error: HTTP ${response.status}`,
        response.status,
        errorBody?.code,
        errorBody,
      )
    }

    if (expectNoContent) {
      return {} as T
    }

    const data = (await response.json()) as T
    return data
  }

  // ── Helper to build request headers ──────────────────────────────────────────

  private buildHeaderBase(requestId?: string): { requestId: string; tppId: string; sendDate: string } {
    return {
      requestId: requestId ?? this.generateRequestId(),
      tppId: this.clientId,
      sendDate: new Date().toISOString(),
    }
  }

  private buildHeaderWithoutToken(requestId?: string): RequestHeaderWithoutToken {
    return this.buildHeaderBase(requestId)
  }

  private buildHeaderWithoutTokenAS(requestId?: string): RequestHeaderWithoutTokenAS {
    return this.buildHeaderBase(requestId)
  }

  private buildHeaderAIS(accessToken: string, requestId?: string): RequestHeaderAIS {
    return {
      ...this.buildHeaderBase(requestId),
      token: accessToken,
      isDirectPsu: false,
    }
  }

  private buildHeaderAISCallback(accessToken: string, requestId?: string): RequestHeaderAISCallback {
    return {
      ...this.buildHeaderBase(requestId),
      token: accessToken,
      isDirectPsu: false,
    }
  }

  private buildHeaderCallback(accessToken: string, requestId?: string): RequestHeaderCallback {
    return {
      ...this.buildHeaderBase(requestId),
      token: accessToken,
    }
  }

  private buildHeader(accessToken: string, requestId?: string): RequestHeader {
    return {
      ...this.buildHeaderBase(requestId),
      token: accessToken,
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // RS: Registration Service
  // ══════════════════════════════════════════════════════════════════════════════

  async register(request: Omit<RegistrationRequest, 'requestHeader'>): Promise<RegistrationResponse> {
    return this.makeRequest<RegistrationResponse>(
      '/v2_1_1.1/register/v2_1_1.1/register',
      request as unknown as Record<string, unknown>,
      { expectStatus: 201 },
    )
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // AS: Authorization Service
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Request an OAuth2 authorization code. Returns the ASPSP redirect URI
   * where the PSU must be redirected for authentication.
   */
  async getAuthorizationUrl(params: {
    redirectUri: string
    scope: ScopeType
    scopeDetails: ScopeDetailsInput
    state: string
  }): Promise<AuthorizeResponse> {
    const requestId = this.generateRequestId()
    const request: AuthorizeRequest = {
      requestHeader: this.buildHeaderWithoutTokenAS(requestId),
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: params.redirectUri,
      scope: params.scope,
      scope_details: params.scopeDetails,
      state: params.state,
    }

    return this.makeRequest<AuthorizeResponse>(
      '/v2_1_1.1/auth/v2_1_1.1/authorize',
      request as unknown as Record<string, unknown>,
    )
  }

  /**
   * Exchange an authorization code for an access token.
   */
  async exchangeCode(params: {
    code: string
    redirectUri: string
  }): Promise<TokenResponse> {
    const requestId = this.generateRequestId()
    const request: TokenRequest = {
      requestHeader: this.buildHeaderWithoutTokenAS(requestId),
      grant_type: 'authorization_code',
      Code: params.code,
      redirect_uri: params.redirectUri,
      client_id: this.clientId,
    }

    return this.makeRequest<TokenResponse>(
      '/v2_1_1.1/auth/v2_1_1.1/token',
      request as unknown as Record<string, unknown>,
    )
  }

  /**
   * Refresh an existing access token.
   */
  async refreshToken(params: {
    refreshToken: string
    scope?: ScopeType
    scopeDetails?: ScopeDetailsInput
  }): Promise<TokenResponse> {
    const requestId = this.generateRequestId()
    const request: TokenRequest = {
      requestHeader: this.buildHeaderWithoutTokenAS(requestId),
      grant_type: 'refresh_token',
      refresh_token: params.refreshToken,
      scope: params.scope,
      scope_details: params.scopeDetails,
    }

    return this.makeRequest<TokenResponse>(
      '/v2_1_1.1/auth/v2_1_1.1/token',
      request as unknown as Record<string, unknown>,
    )
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // AIS: Account Information Service
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Get list of all user's payment accounts.
   */
  async getAccounts(accessToken: string, params?: {
    pageId?: string
    perPage?: number
  }): Promise<AccountsResponse> {
    const requestId = this.generateRequestId()
    const request: AccountsRequest = {
      requestHeader: this.buildHeaderAISCallback(accessToken, requestId),
      pageId: params?.pageId,
      perPage: params?.perPage,
    }

    return this.makeRequest<AccountsResponse>(
      '/v2_1_1.1/accounts/v2_1_1.1/getAccounts',
      request as unknown as Record<string, unknown>,
      { accessToken },
    )
  }

  /**
   * Get detailed information about a single account.
   */
  async getAccount(accessToken: string, accountNumber: string): Promise<AccountResponse> {
    const requestId = this.generateRequestId()
    const request: AccountInfoRequest = {
      requestHeader: this.buildHeaderAIS(accessToken, requestId),
      accountNumber,
    }

    return this.makeRequest<AccountResponse>(
      '/v2_1_1.1/accounts/v2_1_1.1/getAccount',
      request as unknown as Record<string, unknown>,
      { accessToken },
    )
  }

  /**
   * Get list of completed (done) transactions.
   */
  async getTransactionsDone(accessToken: string, params: {
    accountNumber: string
    transactionDateFrom?: string
    transactionDateTo?: string
    bookingDateFrom?: string
    bookingDateTo?: string
    minAmount?: string
    maxAmount?: string
    type?: 'DEBIT' | 'CREDIT'
    pageId?: string
    perPage?: number
    itemIdFrom?: string
  }): Promise<TransactionsDoneInfoResponse> {
    const requestId = this.generateRequestId()
    const request: TransactionInfoRequest = {
      requestHeader: this.buildHeaderAISCallback(accessToken, requestId),
      accountNumber: params.accountNumber,
      transactionDateFrom: params.transactionDateFrom,
      transactionDateTo: params.transactionDateTo,
      bookingDateFrom: params.bookingDateFrom,
      bookingDateTo: params.bookingDateTo,
      minAmount: params.minAmount,
      maxAmount: params.maxAmount,
      type: params.type,
      pageId: params.pageId,
      perPage: params.perPage,
      itemIdFrom: params.itemIdFrom,
    }

    return this.makeRequest<TransactionsDoneInfoResponse>(
      '/v2_1_1.1/accounts/v2_1_1.1/getTransactionsDone',
      request as unknown as Record<string, unknown>,
      { accessToken },
    )
  }

  /**
   * Get list of pending transactions.
   */
  async getTransactionsPending(accessToken: string, params: {
    accountNumber: string
    transactionDateFrom?: string
    transactionDateTo?: string
    minAmount?: string
    maxAmount?: string
    type?: 'DEBIT' | 'CREDIT'
    pageId?: string
    perPage?: number
  }): Promise<TransactionPendingInfoResponse> {
    const requestId = this.generateRequestId()
    const request: TransactionInfoRequest = {
      requestHeader: this.buildHeaderAISCallback(accessToken, requestId),
      accountNumber: params.accountNumber,
      transactionDateFrom: params.transactionDateFrom,
      transactionDateTo: params.transactionDateTo,
      minAmount: params.minAmount,
      maxAmount: params.maxAmount,
      type: params.type,
      pageId: params.pageId,
      perPage: params.perPage,
    }

    return this.makeRequest<TransactionPendingInfoResponse>(
      '/v2_1_1.1/accounts/v2_1_1.1/getTransactionsPending',
      request as unknown as Record<string, unknown>,
      { accessToken },
    )
  }

  /**
   * Get detailed information about a single transaction.
   */
  async getTransactionDetail(accessToken: string, params: {
    itemId: string
    accountNumber: string
    bookingDate?: string
  }): Promise<TransactionDetailResponse> {
    const requestId = this.generateRequestId()
    const request: TransactionDetailRequest = {
      requestHeader: this.buildHeaderAIS(accessToken, requestId),
      itemId: params.itemId,
      accountNumber: params.accountNumber,
      bookingDate: params.bookingDate,
    }

    return this.makeRequest<TransactionDetailResponse>(
      '/v2_1_1.1/accounts/v2_1_1.1/getTransactionDetail',
      request as unknown as Record<string, unknown>,
      { accessToken },
    )
  }

  /**
   * Get list of holds (blocked amounts).
   */
  async getHolds(accessToken: string, params: {
    accountNumber: string
    transactionDateFrom?: string
    transactionDateTo?: string
    minAmount?: string
    maxAmount?: string
    type?: 'DEBIT' | 'CREDIT'
    pageId?: string
    perPage?: number
  }): Promise<HoldInfoResponse> {
    const requestId = this.generateRequestId()
    const request: HoldRequest = {
      requestHeader: this.buildHeaderAISCallback(accessToken, requestId),
      accountNumber: params.accountNumber,
      transactionDateFrom: params.transactionDateFrom,
      transactionDateTo: params.transactionDateTo,
      minAmount: params.minAmount,
      maxAmount: params.maxAmount,
      type: params.type,
      pageId: params.pageId,
      perPage: params.perPage,
    }

    return this.makeRequest<HoldInfoResponse>(
      '/v2_1_1.1/accounts/v2_1_1.1/getHolds',
      request as unknown as Record<string, unknown>,
      { accessToken },
    )
  }

  /**
   * Delete (revoke) an AIS consent.
   */
  async deleteConsent(consentId: string): Promise<void> {
    const requestId = this.generateRequestId()
    const request: DeleteConsentRequest = {
      consentId,
      requestHeader: this.buildHeaderWithoutToken(requestId),
    }

    await this.makeRequest<Record<string, never>>(
      '/v2_1_1.1/accounts/v2_1_1.1/deleteConsent',
      request as unknown as Record<string, unknown>,
      { expectStatus: 204, expectNoContent: true },
    )
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // PIS: Payment Initiation Service
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Initiate a domestic transfer.
   */
  async domesticTransfer(accessToken: string, params: {
    recipient: PaymentDomesticRequest['recipient']
    sender: PaymentDomesticRequest['sender']
    transferData: PaymentDomesticRequest['transferData']
    tppTransactionId: string
    deliveryMode: PaymentDomesticRequest['deliveryMode']
    system: PaymentDomesticRequest['system']
    hold?: boolean
    executionMode?: PaymentDomesticRequest['executionMode']
  }): Promise<PaymentsResponse> {
    const requestId = this.generateRequestId()
    const request: PaymentDomesticRequest = {
      requestHeader: this.buildHeaderCallback(accessToken, requestId),
      recipient: params.recipient,
      sender: params.sender,
      transferData: params.transferData,
      tppTransactionId: params.tppTransactionId,
      deliveryMode: params.deliveryMode,
      system: params.system,
      hold: params.hold,
      executionMode: params.executionMode,
    }

    return this.makeRequest<PaymentsResponse>(
      '/v2_1_1.1/payments/v2_1_1.1/domestic',
      request as unknown as Record<string, unknown>,
      { accessToken },
    )
  }

  /**
   * Get payment status.
   */
  async getPayment(accessToken: string, params: {
    paymentId?: string
    tppTransactionId?: string
  }): Promise<GetPaymentResponse> {
    const requestId = this.generateRequestId()
    const request: PaymentRequest = {
      requestHeader: this.buildHeader(accessToken, requestId),
      paymentId: params.paymentId,
      tppTransactionId: params.tppTransactionId,
    }

    return this.makeRequest<GetPaymentResponse>(
      '/v2_1_1.1/payments/v2_1_1.1/getPayment',
      request as unknown as Record<string, unknown>,
      { accessToken },
    )
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // CAF: Confirmation of Availability of Funds
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Check if funds are available on the specified account.
   */
  async confirmFunds(params: {
    accountNumber: string
    amount: string
    currency: string
  }): Promise<ConfirmationOfFundsResponse> {
    const requestId = this.generateRequestId()
    const request: ConfirmationOfFundsRequest = {
      requestHeader: this.buildHeaderWithoutToken(requestId),
      accountNumber: params.accountNumber,
      amount: params.amount,
      currency: params.currency,
    }

    return this.makeRequest<ConfirmationOfFundsResponse>(
      '/v2_1_1.1/confirmation/v2_1_1.1/getConfirmationOfFunds',
      request as unknown as Record<string, unknown>,
    )
  }
}

// ── Factory ────────────────────────────────────────────────────────────────────

let _client: PkoPsd2Client | null = null

export function getPkoClient(): PkoPsd2Client {
  if (!_client) {
    const baseUrl = process.env.PKO_API_BASE_URL
    const clientId = process.env.PKO_CLIENT_ID
    const clientSecret = process.env.PKO_CLIENT_SECRET
    const signingKeyPem = process.env.PKO_SIGNING_KEY_PEM

    if (!baseUrl || !clientId || !clientSecret) {
      throw new Error('Missing PKO PSD2 configuration: PKO_API_BASE_URL, PKO_CLIENT_ID, PKO_CLIENT_SECRET')
    }

    _client = new PkoPsd2Client({
      baseUrl,
      clientId,
      clientSecret,
      signingKeyPem,
    })
  }

  return _client
}
