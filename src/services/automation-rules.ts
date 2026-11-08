/**
 * Pure helpers shared by the server (auto-responder, drips, broadcast) and the
 * browser (chatbot simulator). Must NOT import any Node module.
 */

export type ChatbotRuleAction = 'send_message' | 'recommend_product' | 'transfer_agent';

export interface ChatbotRule {
  id: string;
  name: string;
  keywords: string; // comma separated
  reply: string;
  action: ChatbotRuleAction;
}

export interface ChatbotConfig {
  enabled: boolean;
  welcomeMessage: string;
  rules: ChatbotRule[];
}

/** Legacy shape stored before rules existed ("options" menu). */
interface LegacyChatbotOption {
  id: string;
  label: string;
  recommendedProduct?: string;
  reply: string;
}

/** Lowercase, strip accents/emoji/punctuation, collapse whitespace. */
export function normalizeText(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseKeywords(keywords: string): string[] {
  return (keywords || '')
    .split(',')
    .map((k) => normalizeText(k))
    .filter((k) => k.length > 0);
}

/**
 * Returns the first rule whose keyword appears in the text as a whole word
 * (or whole phrase for multi-word keywords). Empty keywords never match.
 */
export function matchChatbotRule(text: string, rules: ChatbotRule[]): ChatbotRule | null {
  const normalized = ` ${normalizeText(text)} `;
  if (!normalized.trim()) return null;
  for (const rule of rules || []) {
    const keywords = parseKeywords(rule.keywords);
    if (keywords.some((kw) => normalized.includes(` ${kw} `))) return rule;
  }
  return null;
}

/** Converts the legacy `options` format into `rules`, keeping whatever is already a rule. */
export function normalizeChatbotConfig(raw: any): ChatbotConfig {
  const enabled = raw?.enabled !== undefined ? !!raw.enabled : true;
  const welcomeMessage = typeof raw?.welcomeMessage === 'string' ? raw.welcomeMessage : '';

  if (Array.isArray(raw?.rules)) {
    return { enabled, welcomeMessage, rules: raw.rules };
  }

  const options: LegacyChatbotOption[] = Array.isArray(raw?.options) ? raw.options : [];
  const rules: ChatbotRule[] = options.map((o) => {
    // "1️⃣ Cocinas Industriales" -> "cocinas industriales". Only the full phrase is used:
    // rules override the AI with real customers, so loose words ("acero", "2") would hijack
    // normal questions. Advisors can add more keywords from the UI.
    const keywords = normalizeText(o.label).replace(/^\d+\s*/, '');
    return {
      id: o.id,
      name: o.label,
      keywords,
      reply: o.reply,
      action: o.recommendedProduct ? 'recommend_product' : 'send_message',
    };
  });
  return { enabled, welcomeMessage, rules };
}

export interface TemplateVars {
  cliente?: string;
  equipo?: string;
  precio?: string | number;
  ubicacion?: string;
  garantia?: string;
}

export const TEMPLATE_DEFAULTS = {
  cliente: 'Estimado cliente',
  equipo: 'Cocina Industrial en Acero Inoxidable',
  precio: '$200',
  ubicacion: 'Quito Norte, frente al Club de Leones',
  garantia: 'Garantía directa de fabricación por 1 año',
};

/** Replaces every supported {variable}; unknown values fall back to TEMPLATE_DEFAULTS. */
export function interpolateTemplate(content: string, vars: TemplateVars = {}): string {
  const values: Record<string, string> = {
    cliente: vars.cliente || TEMPLATE_DEFAULTS.cliente,
    equipo: vars.equipo || TEMPLATE_DEFAULTS.equipo,
    precio:
      typeof vars.precio === 'number' ? `$${vars.precio}` : vars.precio || TEMPLATE_DEFAULTS.precio,
    ubicacion: vars.ubicacion || TEMPLATE_DEFAULTS.ubicacion,
    garantia: vars.garantia || TEMPLATE_DEFAULTS.garantia,
  };
  return (content || '').replace(/\{(cliente|equipo|precio|ubicacion|garantia)\}/gi, (_m, key: string) => values[key.toLowerCase()]);
}

/** Meta only allows standard (RESPONSE) messages within 24h of the customer's last message. */
export const META_WINDOW_SAFE_MS = 23 * 60 * 60 * 1000;

export function lastCustomerMessageAt(history: Array<{ sender: string; createdAt?: string | Date }> = []): number {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.sender === 'customer' && m.createdAt) {
      const t = new Date(m.createdAt).getTime();
      if (!Number.isNaN(t)) return t;
    }
  }
  return 0;
}

export function isWithinMessagingWindow(history: Array<{ sender: string; createdAt?: string | Date }> = [], nowMs = Date.now()): boolean {
  const last = lastCustomerMessageAt(history);
  return last > 0 && nowMs - last < META_WINDOW_SAFE_MS;
}
