/**
 * Shared (browser + server) helpers to tell real product photos apart from
 * generic stock images. Must NOT import any Node module.
 */

/** Free stock-photo hosts: their images are never the business's own equipment. */
const STOCK_IMAGE_HOSTS = [
  'unsplash.com',
  'pexels.com',
  'pixabay.com',
  'freepik.com',
  'shutterstock.com',
  'istockphoto.com',
  'gettyimages.com',
  'placehold.co',
  'placeholder.com',
  'picsum.photos',
];

export function isStockImage(url?: string | null): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (!/^https?:\/\//.test(lower)) return false; // local uploads and data: URIs are the user's own
  try {
    const host = new URL(lower).hostname;
    return STOCK_IMAGE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** True when the product has an image that is not a stock placeholder. */
export function hasRealPhoto(url?: string | null): boolean {
  return !!url && url.trim().length > 0 && !isStockImage(url);
}
