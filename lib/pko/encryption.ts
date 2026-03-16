// ══════════════════════════════════════════════════════════════════════════════
// AES-256-GCM Encryption for storing PKO tokens in database
// ══════════════════════════════════════════════════════════════════════════════

import * as crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16 // 128 bits

function getEncryptionKey(): Buffer {
  const key = process.env.PKO_ENCRYPTION_KEY
  if (!key) {
    throw new Error('PKO_ENCRYPTION_KEY environment variable is not set')
  }

  // Support both raw hex keys and base64 keys
  // Expect 32 bytes (256 bits)
  if (key.length === 64) {
    // Hex-encoded 32-byte key
    return Buffer.from(key, 'hex')
  }

  const decoded = Buffer.from(key, 'base64')
  if (decoded.length === 32) {
    return decoded
  }

  // If the key is a passphrase, derive a key using scrypt
  return crypto.scryptSync(key, 'solvio-pko-salt', 32)
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a string in the format: iv:authTag:ciphertext (all base64-encoded).
 */
export function encrypt(text: string): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  })

  let encrypted = cipher.update(text, 'utf8', 'base64')
  encrypted += cipher.final('base64')

  const authTag = cipher.getAuthTag()

  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted,
  ].join(':')
}

/**
 * Decrypt a string that was encrypted with encrypt().
 * Expects the format: iv:authTag:ciphertext (all base64-encoded).
 */
export function decrypt(encrypted: string): string {
  const key = getEncryptionKey()
  const parts = encrypted.split(':')

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format — expected iv:authTag:ciphertext')
  }

  const [ivB64, authTagB64, ciphertext] = parts as [string, string, string]
  const iv = Buffer.from(ivB64, 'base64')
  const authTag = Buffer.from(authTagB64, 'base64')

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  })
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}
