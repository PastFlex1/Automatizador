import crypto from 'crypto';

// Get or derive a consistent 32-byte encryption key from environment
function getEncryptionKey(): Buffer {
  const secret =
    process.env.SOCIAL_ENCRYPTION_SECRET ||
    'c2f4c8b681645de77765c07d82ce8acdebbf83c81a5d588d9760c3e5839d59d1';

  // If already a 64-char hex string (32 bytes), parse directly
  if (/^[0-9a-fA-F]{64}$/.test(secret)) {
    return Buffer.from(secret, 'hex');
  }

  return crypto.createHash('sha256').update(secret).digest();
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM

export function encryptToken(plainText: string): string {
  if (!plainText) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptToken(cipherString: string): string {
  if (!cipherString) return '';
  const parts = cipherString.split(':');
  if (parts.length !== 3) {
    // If not properly formatted, return empty to prevent crash
    return '';
  }
  
  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = getEncryptionKey();
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
