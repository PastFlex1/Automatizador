/**
 * Media URL Validator for Meta Graph API
 * Meta requires publicly accessible HTTP/HTTPS URLs to ingest images and videos.
 */
export function validatePublicMediaUrl(url?: string): { isValid: boolean; error?: string } {
  if (!url || typeof url !== 'string') {
    return { isValid: false, error: 'URL de multimedia no proporcionada.' };
  }

  const trimmed = url.trim();

  // Must be valid HTTP or HTTPS
  if (!/^https?:\/\//i.test(trimmed)) {
    return {
      isValid: false,
      error: `La URL '${trimmed.slice(0, 40)}...' no es un protocolo HTTP/HTTPS válido.`,
    };
  }

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.toLowerCase();

    // Check for localhost or loopback
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local')
    ) {
      return {
        isValid: false,
        error: `Meta no puede acceder a URLs locales (${hostname}). Debes proporcionar una URL pública accesible en internet (HTTPS).`,
      };
    }

    // Check for private IPv4 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
    if (
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return {
        isValid: false,
        error: `Meta no puede acceder a redes privadas (${hostname}). Utiliza una URL pública de internet.`,
      };
    }

    return { isValid: true };
  } catch {
    return { isValid: false, error: `La URL '${trimmed.slice(0, 40)}...' tiene un formato inválido.` };
  }
}
