import crypto from 'crypto';

export class MetaSignatureValidator {
  /**
   * Validate the X-Hub-Signature-256 header sent by Meta Webhooks
   * using the META_APP_SECRET and the raw request body.
   */
  static validateSignature(
    rawBody: Buffer | string | undefined,
    signatureHeader: string | undefined,
    appSecret: string | undefined
  ): { valid: boolean; reason?: string } {
    const secret = appSecret || process.env.META_APP_SECRET;

    // If no app secret is configured in the environment:
    // In strict production, fail closed. In development without secret, allow bypass with warning.
    if (!secret || secret.trim() === '') {
      if (process.env.NODE_ENV === 'production') {
        return { valid: false, reason: 'META_APP_SECRET no configurado en entorno de producción.' };
      }
      return { valid: true, reason: 'BYPASS_DEV_NO_SECRET' };
    }

    if (!signatureHeader) {
      return { valid: false, reason: 'Cabecera X-Hub-Signature-256 faltante en la petición de Meta.' };
    }

    if (!rawBody) {
      return { valid: false, reason: 'Cuerpo de petición (rawBody) vacío para verificación de firma.' };
    }

    const [algorithm, signatureHash] = signatureHeader.split('=');
    if (algorithm !== 'sha256' || !signatureHash) {
      return { valid: false, reason: 'Formato de cabecera de firma inválido. Se esperaba sha256=...' };
    }

    try {
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody);
      const expectedHash = hmac.digest('hex');

      const expectedBuffer = Buffer.from(expectedHash, 'utf8');
      const signatureBuffer = Buffer.from(signatureHash, 'utf8');

      if (expectedBuffer.length !== signatureBuffer.length) {
        return { valid: false, reason: 'Firma criptográfica inválida (longitud incorrecta).' };
      }

      const isMatch = crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
      if (!isMatch) {
        return { valid: false, reason: 'Firma criptográfica inválida (hash no coincide con META_APP_SECRET).' };
      }

      return { valid: true };
    } catch (err: any) {
      return { valid: false, reason: `Error durante validación de firma: ${err.message}` };
    }
  }
}
