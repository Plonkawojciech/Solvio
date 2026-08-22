import crypto from 'crypto'

/**
 * Szyfrowanie sekretów, które musimy odzyskać w jawnej postaci — dziś wyłącznie
 * klucz API do crm.programo.pl. Nasze własne klucze (`lib/api-keys.ts`) idą do
 * bazy jako hash i nigdy nie wracają; ten plik jest o tym drugim przypadku.
 *
 * Klucz wyprowadzamy z `SESSION_SECRET`, żeby nie dokładać kolejnej zmiennej
 * środowiskowej do wpięcia w Coolify. Konsekwencja jest jawna: rotacja
 * SESSION_SECRET unieważnia zapisane połączenia z CRM-em i trzeba je wpiąć
 * ponownie (dostajemy wtedy czytelny błąd, nie ciche śmieci).
 */
function boxKey(): Buffer {
  const secret = process.env.SESSION_SECRET ?? 'solvio-dev-only-secret-do-not-use-in-production'
  return crypto.createHash('sha256').update(`${secret}|crm-box`).digest()
}

/** Zwraca `iv.tag.ciphertext`, wszystko base64url. */
export function seal(plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', boxKey(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, enc].map((b) => b.toString('base64url')).join('.')
}

/** Zwraca null zamiast rzucać — wywołujący ma pokazać „wepnij klucz ponownie". */
export function open(sealed: string): string | null {
  try {
    const [ivB64, tagB64, encB64] = sealed.split('.')
    if (!ivB64 || !tagB64 || !encB64) return null
    const decipher = crypto.createDecipheriv('aes-256-gcm', boxKey(), Buffer.from(ivB64, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(encB64, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
