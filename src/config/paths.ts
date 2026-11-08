import fs from 'node:fs';
import path from 'node:path';

/**
 * Where runtime data lives. Locally it is src/data and public/equipos (as before);
 * on a server point DATA_DIR / UPLOADS_DIR to a persistent volume so leads, settings
 * and photos survive redeploys.
 */
const BUNDLED_DATA_DIR = path.join(process.cwd(), 'src', 'data');
const BUNDLED_UPLOADS_DIR = path.join(process.cwd(), 'public', 'equipos');

export function dataDir(): string {
  return process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : BUNDLED_DATA_DIR;
}

export function dataFile(name: string): string {
  return path.join(dataDir(), name);
}

export function uploadsDir(): string {
  return process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : BUNDLED_UPLOADS_DIR;
}

/** Resolves a public image path like "/equipos/foto.jpg" to the file on disk. */
export function resolvePublicImage(urlPath: string): string {
  const clean = urlPath.replace(/^\/+/, '');
  if (clean.startsWith('equipos/')) return path.join(uploadsDir(), clean.slice('equipos/'.length));
  return path.join(process.cwd(), 'public', clean);
}

/** false when AUTOMATIONS_ENABLED=false: no Messenger/WhatsApp replies, drips or auto-publishing. */
export function automationsEnabled(): boolean {
  return (process.env.AUTOMATIONS_ENABLED || 'true').toLowerCase() !== 'false';
}

/**
 * On first boot with an empty volume, copy the bundled JSON data and photos into
 * DATA_DIR / UPLOADS_DIR. Existing files are never overwritten.
 */
export function initDataDirs(): void {
  const pairs: Array<[string, string]> = [
    [BUNDLED_DATA_DIR, dataDir()],
    [BUNDLED_UPLOADS_DIR, uploadsDir()],
  ];
  for (const [from, to] of pairs) {
    fs.mkdirSync(to, { recursive: true });
    if (path.resolve(from) === path.resolve(to) || !fs.existsSync(from)) continue;
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name.endsWith('.ts')) continue;
      const target = path.join(to, entry.name);
      if (!fs.existsSync(target)) fs.copyFileSync(path.join(from, entry.name), target);
    }
  }
}
