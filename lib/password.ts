import crypto from 'crypto'

// Hasła: scrypt z node:crypto — bez zewnętrznych zależności, bezpieczne
// parametry (N=16384, r=8, p=1), format: scrypt$saltHex$hashHex

const SCRYPT_KEYLEN = 64
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16)
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTS, (err, derived) => {
      if (err) return reject(err)
      resolve(`scrypt$${salt.toString('hex')}$${derived.toString('hex')}`)
    })
  })
}

export function verifyPassword(password: string, stored: string): Promise<boolean> {
  return new Promise((resolve) => {
    const parts = stored.split('$')
    if (parts.length !== 3 || parts[0] !== 'scrypt') return resolve(false)
    const salt = Buffer.from(parts[1], 'hex')
    const expected = Buffer.from(parts[2], 'hex')
    crypto.scrypt(password, salt, expected.length, SCRYPT_OPTS, (err, derived) => {
      if (err) return resolve(false)
      resolve(crypto.timingSafeEqual(derived, expected))
    })
  })
}
