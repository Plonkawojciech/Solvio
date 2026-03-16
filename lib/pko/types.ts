// ══════════════════════════════════════════════════════════════════════════════
// PKO PSD2 API Types — based on Polish API v2.1.1 (Swagger 1.6)
// ══════════════════════════════════════════════════════════════════════════════

// ── Enums ──────────────────────────────────────────────────────────────────────

export type PaymentStatus = 'submitted' | 'cancelled' | 'pending' | 'done' | 'rejected' | 'scheduled'

export type DeliveryMode = 'ExpressD0' | 'StandardD1'

export type System = 'Elixir' | 'ExpressElixir' | 'Sorbnet' | 'Internal'

export type ExecutionMode = 'Immediate' | 'FutureDated'

export type TransactionCategory = 'DEBIT' | 'CREDIT'

export type ScopeType = 'ais-accounts' | 'ais' | 'pis'

export type ScopeUsageLimit = 'single' | 'multiple'

export type ThrottlingPolicy = 'psd2Regulatory'

export type ScopeGroupType = 'ais-accounts' | 'ais' | 'pis'

export type GrantType = 'authorization_code' | 'refresh_token'

export type ResponseType = 'code' | 'token'

export type TokenEndpointAuthMethod = 'client_secret_post' | 'client_secret_basic' | 'none'

export type AccountHolderType = 'individual' | 'corporation'

// ── Common ─────────────────────────────────────────────────────────────────────

export interface DictionaryItem {
  code?: string
  description?: string
}

export interface NameAddress {
  value?: string[]
}

export interface NameAddressStructured {
  name: string
  addressStructured?: AddressStructured
  addressLine?: string
}

export interface AddressStructured {
  department?: string
  subDeptartment?: string
  streetName?: string
  buildingNumber?: string
  buildingName?: string
  floor?: string
  postBox?: string
  room?: string
  postCode?: string
  townName: string
  townLocationName?: string
  districtName?: string
  countrySubDivision?: string
  countryCode?: string
  country: string
}

export interface Identifiers {
  idType: 'LEI' | 'TXID'
  idValue: string
  issuer?: string
}

export interface UltimateParty {
  nameAddressStructured: NameAddressStructured
  identifiers?: Identifiers
}

export interface PageInfo {
  previousPage?: string
  nextPage?: string
}

export interface CurrencyRate {
  rate?: number
  fromCurrency?: string
  toCurrency?: string
}

export interface BankAccountInfo {
  bicOrSwift?: string
  name?: string
  address?: string[]
}

export interface Bank {
  bicOrSwift?: string
  name?: string
  code?: string
  address?: string[]
  countryCode?: string
}

export interface Purpose {
  code?: string
  proprietary?: string
}

// ── Request Headers ────────────────────────────────────────────────────────────

export interface RequestHeaderBase {
  requestId: string
  userAgent?: string
  ipAddress?: string
  sendDate?: string
  tppId: string
}

export interface RequestHeaderWithoutToken extends RequestHeaderBase {}

export interface RequestHeaderWithoutTokenAS extends RequestHeaderBase {
  isCompanyContext?: boolean
  psuIdentifierType?: string
  psuIdentifierValue?: string
  psuContextIdentifierType?: string
  psuContextIdentifierValue?: string
}

export interface RequestHeader extends RequestHeaderBase {
  token: string
}

export interface RequestHeaderAIS extends RequestHeaderBase {
  token: string
  isDirectPsu?: boolean
}

export interface RequestHeaderAISCallback extends RequestHeaderBase {
  token: string
  isDirectPsu?: boolean
  callbackURL?: string
  apiKey?: string
}

export interface RequestHeaderCallback extends RequestHeaderBase {
  token: string
  callbackURL?: string
  apiKey?: string
}

// ── Response Header ────────────────────────────────────────────────────────────

export interface ResponseHeader {
  requestId?: string
  sendDate?: string
  isCallback?: boolean
}

// ── RS: Registration ───────────────────────────────────────────────────────────

export interface RegistrationRequest {
  client_name?: string
  client_uri?: string
  contacts?: string[]
  grant_types?: string[]
  jwks?: { keys: JWK[] }
  jwks_uri?: string
  logo_uri?: string
  policy_uri?: string
  redirect_uris?: string[]
  response_types?: ResponseType[]
  scope?: string
  software_id?: string
  software_statement: string
  address: string
  delivery_address: string
  email: string
  phone: string
  software_version?: string
  token_endpoint_auth_method?: TokenEndpointAuthMethod
  tos_uri?: string
}

export interface JWK {
  kty: string
  alg?: string
  use?: 'sig' | 'enc'
  kid?: string
  n?: string
  e?: string
  d?: string
  p?: string
  q?: string
  dp?: string
  dq?: string
  qi?: string
  x5c?: string[]
  x5t?: string
  'x5t#S256'?: string
  x5u?: string
  crv?: string
  x?: string
  y?: string
  k?: string
  key_ops?: string[]
}

export interface RegistrationResponse {
  client_id?: string
  client_id_issued_at?: string
  client_name?: string
  client_secret?: string
  client_secret_expires_at?: string
  client_uri?: string
  contacts?: string[]
  grant_types?: string[]
  jwks?: { keys: JWK[] }
  jwks_uri?: string
  logo_uri?: string
  policy_uri?: string
  redirect_uris?: string[]
  response_types?: ResponseType[]
  scope?: string
  software_id?: string
  software_version?: string
  token_endpoint_auth_method?: TokenEndpointAuthMethod
  tos_uri?: string
}

// ── AS: Authorize ──────────────────────────────────────────────────────────────

export interface AuthorizeRequest {
  requestHeader: RequestHeaderWithoutTokenAS
  response_type: string
  client_id: string
  redirect_uri: string
  scope: ScopeType
  scope_details: ScopeDetailsInput
  state: string
}

export interface AuthorizeResponse {
  responseHeader: ResponseHeader
  aspspRedirectUri: string
}

// ── AS: Token ──────────────────────────────────────────────────────────────────

export interface TokenRequest {
  requestHeader?: RequestHeaderWithoutTokenAS
  grant_type: GrantType
  Code?: string
  redirect_uri?: string
  client_id?: string
  refresh_token?: string
  scope?: ScopeType
  scope_details?: ScopeDetailsInput
  is_user_session?: boolean
  user_ip?: string
  user_agent?: string
}

export interface TokenResponse {
  responseHeader: ResponseHeader
  access_token: string
  token_type: string
  expires_in: string
  refresh_token?: string
  scope?: ScopeType
  scope_details: ScopeDetailsOutput
}

// ── AS: Scope Details ──────────────────────────────────────────────────────────

export interface PrivilegeAisSimple {
  scopeUsageLimit?: ScopeUsageLimit
}

export interface PrivilegeAis {
  scopeUsageLimit?: ScopeUsageLimit
  maxAllowedHistoryLong: number
}

export interface PrivilegeDomesticTransfer {
  scopeUsageLimit?: 'single'
  recipient?: RecipientPIS
  sender?: SenderPISDomestic
  transferData?: TransferDataCurrencyRequired
  deliveryMode?: DeliveryMode
  system: System
  executionMode?: ExecutionMode
}

export interface PrivilegePayment {
  scopeUsageLimit?: 'multiple'
  paymentId?: string
  tppTransactionId?: string
}

export interface PrivilegeBundle {
  scopeUsageLimit?: 'multiple'
  bundleId?: string
  tppBundleId?: string
}

export interface PrivilegeBundleTransfers {
  scopeUsageLimit?: 'single'
  transfersTotalAmount?: string
  typeOfTransfers?: 'domestic' | 'EEA' | 'nonEEA' | 'tax'
}

export interface PrivilegeCancelPayment {
  scopeUsageLimit?: 'multiple'
  paymentId?: string
  bundleId?: string
}

export interface PrivilegeList {
  accountNumber?: string
  'ais-accounts:getAccounts'?: PrivilegeAisSimple
  'ais:getAccount'?: PrivilegeAisSimple
  'ais:getHolds'?: PrivilegeAis
  'ais:getTransactionsDone'?: PrivilegeAis
  'ais:getTransactionsPending'?: PrivilegeAis
  'ais:getTransactionsRejected'?: PrivilegeAis
  'ais:getTransactionsCancelled'?: PrivilegeAis
  'ais:getTransactionsScheduled'?: PrivilegeAis
  'ais:getTransactionDetail'?: PrivilegeAisSimple
  'pis:getPayment'?: PrivilegePayment
  'pis:getBundle'?: PrivilegeBundle
  'pis:domestic'?: PrivilegeDomesticTransfer
  'pis:tax'?: Record<string, unknown>
  'pis:cancelPayment'?: PrivilegeCancelPayment
  'pis:bundle'?: PrivilegeBundleTransfers
}

export interface ScopeDetailsInput {
  privilegeList?: PrivilegeList[]
  scopeGroupType: ScopeGroupType
  consentId: string
  scopeTimeLimit: string
  throttlingPolicy: ThrottlingPolicy
}

export interface ScopeDetailsOutput {
  privilegeList?: PrivilegeList[]
  consentId: string
  scopeTimeLimit: string
  throttlingPolicy: ThrottlingPolicy
}

// ── AIS: Accounts ──────────────────────────────────────────────────────────────

export interface AccountsRequest {
  requestHeader: RequestHeaderAISCallback
  pageId?: string
  perPage?: number
}

export interface AccountsResponse {
  responseHeader: ResponseHeader
  accounts?: AccountBaseInfo[]
  pageInfo?: PageInfo
}

export interface AccountBaseInfo {
  accountNumber: string
  accountTypeName?: string
  accountType: DictionaryItem
}

export interface AccountInfoRequest {
  requestHeader: RequestHeaderAIS
  accountNumber: string
}

export interface AccountResponse {
  responseHeader: ResponseHeader
  account?: AccountInfo
}

export interface AccountInfo {
  accountNumber: string
  nameAddress?: NameAddress
  accountType: DictionaryItem
  accountTypeName?: string
  accountHolderType: AccountHolderType
  accountNameClient?: string
  currency: string
  availableBalance: string
  bookingBalance: string
  bank?: BankAccountInfo
  auxData?: Record<string, string>
}

// ── AIS: Transactions ──────────────────────────────────────────────────────────

export interface TransactionInfoRequest {
  requestHeader: RequestHeaderAISCallback
  accountNumber: string
  itemIdFrom?: string
  transactionDateFrom?: string
  transactionDateTo?: string
  bookingDateFrom?: string
  bookingDateTo?: string
  minAmount?: string
  maxAmount?: string
  pageId?: string
  perPage?: number
  type?: TransactionCategory
}

export interface HoldRequest {
  requestHeader: RequestHeaderAISCallback
  accountNumber: string
  itemIdFrom?: string
  transactionDateFrom?: string
  transactionDateTo?: string
  minAmount?: string
  maxAmount?: string
  pageId?: string
  perPage?: number
  type?: TransactionCategory
}

export interface ItemInfoBase {
  itemId: string
  amount: string
  currency?: string
  description?: string
  transactionType?: string
  tradeDate?: string
  mcc?: string
  auxData?: Record<string, string>
}

export interface TransactionInfo extends ItemInfoBase {
  transactionCategory: TransactionCategory
  transactionStatus?: DictionaryItem
  initiator?: NameAddress
  sender?: SenderRecipient
  recipient?: SenderRecipient
  bookingDate?: string
  postTransactionBalance?: string
  purpose?: Purpose
}

export interface TransactionPendingInfo extends ItemInfoBase {
  transactionCategory: TransactionCategory
  initiator?: NameAddress
  sender?: SenderRecipient
  recipient?: SenderRecipient
}

export interface HoldInfo extends ItemInfoBase {
  holdExpirationDate?: string
  initiator?: NameAddress
  sender?: SenderRecipient
  recipient?: SenderRecipient
}

export interface SenderRecipient {
  accountNumber?: string
  accountMassPayment?: string
  bank?: Bank
  nameAddress?: NameAddress
  nameAddressStructured?: NameAddressStructured
  identifiers?: Identifiers
  ultimateRecipient?: UltimateParty
}

export interface TransactionsDoneInfoResponse {
  responseHeader: ResponseHeader
  transactions?: TransactionInfo[]
  pageInfo?: PageInfo
}

export interface TransactionPendingInfoResponse {
  responseHeader: ResponseHeader
  transactions?: TransactionPendingInfo[]
  pageInfo?: PageInfo
}

export interface HoldInfoResponse {
  responseHeader: ResponseHeader
  holds?: HoldInfo[]
  pageInfo?: PageInfo
}

export interface TransactionDetailRequest {
  requestHeader: RequestHeaderAIS
  itemId: string
  accountNumber: string
  bookingDate?: string
}

export interface TransactionDetailResponse {
  responseHeader: ResponseHeader
  baseInfo: TransactionInfo
  zusInfo?: Record<string, unknown>
  usInfo?: Record<string, unknown>
  cardInfo?: {
    cardHolder?: string
    cardNumber?: string
  }
  currencyDate?: string
  transactionRate?: CurrencyRate[]
  baseCurrency?: string
  amountBaseCurrency?: string
  usedPaymentInstrumentId?: string
  tppTransactionId?: string
  tppName?: string
  rejectionReason?: string
  holdExpirationDate?: string
}

// ── AIS: Delete Consent ────────────────────────────────────────────────────────

export interface DeleteConsentRequest {
  consentId: string
  requestHeader: RequestHeaderWithoutToken
}

// ── PIS: Domestic Transfer ─────────────────────────────────────────────────────

export interface RecipientPIS {
  accountNumber: string
  nameAddress?: NameAddress
  nameAddressStructured?: NameAddressStructured
  identifiers?: Identifiers
  ultimateRecipient?: UltimateParty
}

export interface SenderPISDomestic {
  accountNumber?: string
  nameAddress?: NameAddress
  nameAddressStructured?: NameAddressStructured
  identifiers?: Identifiers
  ultimateSender?: UltimateParty
}

export interface TransferDataCurrencyRequired {
  currency: string
  description: string
  amount: string
  executionDate?: string
  purpose?: Purpose
}

export interface PaymentDomesticRequest {
  requestHeader: RequestHeaderCallback
  recipient: RecipientPIS
  sender: SenderPISDomestic
  transferData: TransferDataCurrencyRequired
  tppTransactionId: string
  deliveryMode: DeliveryMode
  system: System
  hold?: boolean
  executionMode?: ExecutionMode
}

export interface PaymentInfo {
  paymentId: string
  tppTransactionId: string
  generalStatus: PaymentStatus
  detailedStatus: string
  executionMode: ExecutionMode
}

export interface GetPaymentResponse extends PaymentInfo {
  responseHeader: ResponseHeader
}

export interface PaymentsResponse {
  responseHeader: ResponseHeader
  payments?: PaymentInfo[]
}

export interface PaymentRequest {
  requestHeader: RequestHeader
  paymentId?: string
  tppTransactionId?: string
}

// ── CAF: Confirmation of Funds ─────────────────────────────────────────────────

export interface ConfirmationOfFundsRequest {
  requestHeader: RequestHeaderWithoutToken
  accountNumber: string
  amount: string
  currency: string
}

export interface ConfirmationOfFundsResponse {
  responseHeader: ResponseHeader
  fundsAvailable: boolean
}

// ── Error ──────────────────────────────────────────────────────────────────────

export interface PkoApiErrorResponse {
  responseHeader?: ResponseHeader
  code?: string
  message?: string
}
