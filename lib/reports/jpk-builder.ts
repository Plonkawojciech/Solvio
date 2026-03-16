// JPK_V7M XML generator for Polish tax reporting
// Follows the Polish JPK_V7M schema structure (Jednolity Plik Kontrolny)

export interface CompanyInfo {
  nip: string
  name: string
  email?: string
  phone?: string
  postalCode?: string
  city?: string
  street?: string
  buildingNumber?: string
}

export interface VatEntry {
  id: string
  type: 'input' | 'output'  // naliczony / należny
  documentNumber: string | null
  documentDate: string | null
  counterpartyName: string | null
  counterpartyNip: string | null
  netAmount: string
  vatAmount: string
  vatRate: string
  deductible?: boolean
  period: string  // YYYY-MM
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return new Date().toISOString().split('T')[0]
  return dateStr.slice(0, 10)
}

function getVatRateCode(rate: string): string {
  // Map human-readable rates to JPK codes
  const normalized = rate.replace('%', '').trim().toLowerCase()
  switch (normalized) {
    case '23': return '23'
    case '8': return '8'
    case '5': return '5'
    case '0': return '0'
    case 'zw': return 'zw'
    case 'np': return 'np'
    case 'oo': return 'oo'
    default: return '23'
  }
}

function getPeriodDates(period: string): { year: number; month: number; startDate: string; endDate: string } {
  const [yearStr, monthStr] = period.split('-')
  const year = parseInt(yearStr)
  const month = parseInt(monthStr)
  const startDate = `${period}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${period}-${String(lastDay).padStart(2, '0')}`
  return { year, month, startDate, endDate }
}

export function buildJpkV7M(
  companyInfo: CompanyInfo,
  vatEntries: VatEntry[],
  period: string
): string {
  const { year, month, startDate, endDate } = getPeriodDates(period)
  const now = new Date().toISOString()

  // Separate input (purchases) and output (sales) entries
  const sprzedaz = vatEntries.filter(e => e.type === 'output')
  const zakupy = vatEntries.filter(e => e.type === 'input')

  // Aggregate totals per VAT rate for sales
  const salesByRate = new Map<string, { net: number; vat: number }>()
  for (const entry of sprzedaz) {
    const rateCode = getVatRateCode(entry.vatRate)
    const existing = salesByRate.get(rateCode) || { net: 0, vat: 0 }
    existing.net += parseFloat(entry.netAmount) || 0
    existing.vat += parseFloat(entry.vatAmount) || 0
    salesByRate.set(rateCode, existing)
  }

  // Aggregate totals per VAT rate for purchases
  const purchasesByRate = new Map<string, { net: number; vat: number }>()
  for (const entry of zakupy) {
    const rateCode = getVatRateCode(entry.vatRate)
    const existing = purchasesByRate.get(rateCode) || { net: 0, vat: 0 }
    existing.net += parseFloat(entry.netAmount) || 0
    existing.vat += parseFloat(entry.vatAmount) || 0
    purchasesByRate.set(rateCode, existing)
  }

  // Calculate totals
  const totalSalesNet = sprzedaz.reduce((sum, e) => sum + (parseFloat(e.netAmount) || 0), 0)
  const totalSalesVat = sprzedaz.reduce((sum, e) => sum + (parseFloat(e.vatAmount) || 0), 0)
  const totalPurchasesNet = zakupy.reduce((sum, e) => sum + (parseFloat(e.netAmount) || 0), 0)
  const totalPurchasesVat = zakupy.reduce((sum, e) => sum + (parseFloat(e.vatAmount) || 0), 0)

  // Build SprzedazWiersz (sales rows)
  let sprzedazRows = ''
  sprzedaz.forEach((entry, idx) => {
    const rateCode = getVatRateCode(entry.vatRate)
    const net = (parseFloat(entry.netAmount) || 0).toFixed(2)
    const vat = (parseFloat(entry.vatAmount) || 0).toFixed(2)
    sprzedazRows += `
      <SprzedazWiersz>
        <LpSprzedazy>${idx + 1}</LpSprzedazy>
        ${entry.counterpartyNip ? `<NrKontrahenta>${escapeXml(entry.counterpartyNip)}</NrKontrahenta>` : '<NrKontrahenta>BRAK</NrKontrahenta>'}
        <NazwaKontrahenta>${escapeXml(entry.counterpartyName || 'Kontrahent')}</NazwaKontrahenta>
        <DowodSprzedazy>${escapeXml(entry.documentNumber || `FV/${idx + 1}/${month}/${year}`)}</DowodSprzedazy>
        <DataWystawienia>${formatDate(entry.documentDate)}</DataWystawienia>
        <DataSprzedazy>${formatDate(entry.documentDate)}</DataSprzedazy>
        ${rateCode === '23' ? `<K_19>${net}</K_19><K_20>${vat}</K_20>` : ''}
        ${rateCode === '8' ? `<K_17>${net}</K_17><K_18>${vat}</K_18>` : ''}
        ${rateCode === '5' ? `<K_15>${net}</K_15><K_16>${vat}</K_16>` : ''}
        ${rateCode === '0' ? `<K_13>${net}</K_13>` : ''}
        ${rateCode === 'zw' ? `<K_10>${net}</K_10>` : ''}
      </SprzedazWiersz>`
  })

  // Build SprzedazCtrl
  const sprzedazCtrl = `
      <SprzedazCtrl>
        <LiczbaWierszySprzedazy>${sprzedaz.length}</LiczbaWierszySprzedazy>
        <PodatekNalezny>${totalSalesVat.toFixed(2)}</PodatekNalezny>
      </SprzedazCtrl>`

  // Build ZakupWiersz (purchase rows)
  let zakupRows = ''
  zakupy.forEach((entry, idx) => {
    const net = (parseFloat(entry.netAmount) || 0).toFixed(2)
    const vat = (parseFloat(entry.vatAmount) || 0).toFixed(2)
    zakupRows += `
      <ZakupWiersz>
        <LpZakupu>${idx + 1}</LpZakupu>
        ${entry.counterpartyNip ? `<NrDostawcy>${escapeXml(entry.counterpartyNip)}</NrDostawcy>` : '<NrDostawcy>BRAK</NrDostawcy>'}
        <NazwaDostawcy>${escapeXml(entry.counterpartyName || 'Dostawca')}</NazwaDostawcy>
        <DowodZakupu>${escapeXml(entry.documentNumber || `FZ/${idx + 1}/${month}/${year}`)}</DowodZakupu>
        <DataZakupu>${formatDate(entry.documentDate)}</DataZakupu>
        <DataWplywu>${formatDate(entry.documentDate)}</DataWplywu>
        <K_40>${net}</K_40>
        <K_41>${vat}</K_41>
      </ZakupWiersz>`
  })

  // Build ZakupCtrl
  const zakupCtrl = `
      <ZakupCtrl>
        <LiczbaWierszyZakupow>${zakupy.length}</LiczbaWierszyZakupow>
        <PodatekNaliczony>${totalPurchasesVat.toFixed(2)}</PodatekNaliczony>
      </ZakupCtrl>`

  // Build Deklaracja section (VAT-7 declaration summary)
  const p_10 = (salesByRate.get('zw')?.net || 0).toFixed(2)
  const p_13 = (salesByRate.get('0')?.net || 0).toFixed(2)
  const p_15 = (salesByRate.get('5')?.net || 0).toFixed(2)
  const p_16 = (salesByRate.get('5')?.vat || 0).toFixed(2)
  const p_17 = (salesByRate.get('8')?.net || 0).toFixed(2)
  const p_18 = (salesByRate.get('8')?.vat || 0).toFixed(2)
  const p_19 = (salesByRate.get('23')?.net || 0).toFixed(2)
  const p_20 = (salesByRate.get('23')?.vat || 0).toFixed(2)
  const p_37 = totalSalesNet.toFixed(2)
  const p_38 = totalSalesVat.toFixed(2)
  const p_40 = totalPurchasesNet.toFixed(2)
  const p_41 = totalPurchasesVat.toFixed(2)

  const vatDue = totalSalesVat - totalPurchasesVat
  const p_51 = vatDue >= 0 ? vatDue.toFixed(2) : '0.00'
  const p_53 = vatDue < 0 ? Math.abs(vatDue).toFixed(2) : '0.00'

  // Build full XML
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<JPK xmlns="http://crd.gov.pl/wzor/2021/12/27/11148/" xmlns:etd="http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2021/06/08/eD/DefinicjeTypy/">
  <Naglowek>
    <KodFormularza kodSystemowy="JPK_V7M (2)" wersjaSchemy="1-2E">JPK_VAT</KodFormularza>
    <WariantFormularza>2</WariantFormularza>
    <DataWytworzeniaJPK>${now}</DataWytworzeniaJPK>
    <NazwaSystemu>Solvio Business</NazwaSystemu>
    <CelZlozenia plesData="1">1</CelZlozenia>
    <KodUrzedu>0271</KodUrzedu>
    <Rok>${year}</Rok>
    <Miesiac>${month}</Miesiac>
  </Naglowek>

  <Podmiot1>
    <OsobaNiefizyczna>
      <etd:NIP>${escapeXml(companyInfo.nip)}</etd:NIP>
      <etd:PelnaNazwa>${escapeXml(companyInfo.name)}</etd:PelnaNazwa>
      ${companyInfo.email ? `<Email>${escapeXml(companyInfo.email)}</Email>` : ''}
      ${companyInfo.phone ? `<Telefon>${escapeXml(companyInfo.phone)}</Telefon>` : ''}
    </OsobaNiefizyczna>
  </Podmiot1>

  <Deklaracja>
    <Naglowek>
      <KodFormularzaDekl kodSystemowy="VAT-7 (21)" kodPodatku="VAT" rodzajZobowiazania="Z" wersjaSchemy="1-2E">VAT-7</KodFormularzaDekl>
      <WariantFormularzaDekl>21</WariantFormularzaDekl>
    </Naglowek>
    <PozycjeSzczegolowe>
      <P_10>${p_10}</P_10>
      <P_13>${p_13}</P_13>
      <P_15>${p_15}</P_15>
      <P_16>${p_16}</P_16>
      <P_17>${p_17}</P_17>
      <P_18>${p_18}</P_18>
      <P_19>${p_19}</P_19>
      <P_20>${p_20}</P_20>
      <P_37>${p_37}</P_37>
      <P_38>${p_38}</P_38>
      <P_40>${p_40}</P_40>
      <P_41>${p_41}</P_41>
      <P_51>${p_51}</P_51>
      <P_53>${p_53}</P_53>
      <P_62>1</P_62>
    </PozycjeSzczegolowe>
    <Pouczenia>1</Pouczenia>
  </Deklaracja>

  <Ewidencja>${sprzedazCtrl}${sprzedazRows}${zakupCtrl}${zakupRows}
  </Ewidencja>
</JPK>`

  return xml
}
