import crypto from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';

/**
 * Single-password access control for the CRM.
 *
 * - APP_PASSWORD set   -> every /api route and /equipos photo needs a session cookie
 *                         (browser login) or `Authorization: Bearer <APP_API_TOKEN>` (extension, scripts).
 * - APP_PASSWORD empty -> open access, only allowed outside production (your PC).
 *   In production the API refuses to work until a password is configured.
 *
 * Meta webhooks stay public (they are verified with META_APP_SECRET signatures), and the
 * server's own internal calls use a random per-process token.
 */

const COOKIE = 'mc_session';
const SESSION_DAYS = 30;

/** Random per-boot token for server-to-itself requests (e.g. auto-responder -> /api/ai/live-chat). */
export const INTERNAL_TOKEN = crypto.randomBytes(32).toString('hex');
export const INTERNAL_HEADER = 'x-internal-token';

const PUBLIC_PATHS = [
  /^\/api\/webhooks\//, // Meta webhooks (signature-verified)
  /^\/api\/meta$/, // same webhook router, legacy mount on /api
  /^\/api\/health$/,
  /^\/api\/auth\//,
];

const appPassword = () => process.env.APP_PASSWORD || '';
const isProduction = () => process.env.NODE_ENV === 'production';
export const authRequired = () => !!appPassword() || isProduction();

function sessionSecret(): string {
  // Changing APP_PASSWORD (or SESSION_SECRET) logs every session out.
  return process.env.SESSION_SECRET || crypto.createHash('sha256').update(`mc-session:${appPassword()}`).digest('hex');
}

function sign(value: string): string {
  return crypto.createHmac('sha256', sessionSecret()).update(value).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function createSessionToken(): string {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return `${expires}.${sign(String(expires))}`;
}

function isValidSessionToken(token?: string): boolean {
  if (!token) return false;
  const [expires, sig] = token.split('.');
  if (!expires || !sig || Number(expires) < Date.now()) return false;
  return safeEqual(sig, sign(expires));
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export function isAuthenticated(req: Request): boolean {
  if (!authRequired()) return true;
  if (!appPassword()) return false; // production without password: fail closed

  const internal = req.headers[INTERNAL_HEADER];
  if (typeof internal === 'string' && safeEqual(internal, INTERNAL_TOKEN)) return true;

  const auth = req.headers.authorization || '';
  const apiToken = process.env.APP_API_TOKEN || '';
  if (apiToken && auth.startsWith('Bearer ') && safeEqual(auth.slice(7), apiToken)) return true;

  return isValidSessionToken(readCookie(req, COOKIE));
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const p = req.path;
  const protectedPath = p.startsWith('/api/') || p.startsWith('/equipos/');
  if (!protectedPath || PUBLIC_PATHS.some((re) => re.test(p))) return next();
  if (isAuthenticated(req)) return next();

  if (!appPassword()) {
    return res.status(503).json({ success: false, error: 'Servidor sin contraseña: configura APP_PASSWORD.' });
  }
  return res.status(401).json({ success: false, error: 'Sesión requerida', authRequired: true });
}

// ---------------------------------------------------------------- login API

const attempts = new Map<string, { count: number; first: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;

function tooManyAttempts(ip: string): boolean {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now - a.first > WINDOW_MS) {
    attempts.set(ip, { count: 0, first: now });
    return false;
  }
  return a.count >= MAX_ATTEMPTS;
}

export const authRouter = Router();

authRouter.get('/status', (req, res) => {
  res.json({
    success: true,
    authRequired: authRequired(),
    authenticated: isAuthenticated(req),
    configured: !!appPassword() || !isProduction(),
  });
});

authRouter.post('/login', (req, res) => {
  if (!appPassword()) {
    return res.status(503).json({ success: false, error: 'Servidor sin contraseña: configura APP_PASSWORD.' });
  }
  const ip = req.ip || 'unknown';
  if (tooManyAttempts(ip)) {
    return res.status(429).json({ success: false, error: 'Demasiados intentos. Espera 10 minutos.' });
  }
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!safeEqual(password, appPassword())) {
    attempts.get(ip)!.count++;
    return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
  }
  attempts.delete(ip);
  res.cookie(COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
  res.json({ success: true });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ success: true });
});
