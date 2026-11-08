import fs from 'node:fs';
import path from 'node:path';
import { FacebookSyncService } from './facebook-sync.service.ts';
import { Lead } from '../types.ts';
import { AutomationService } from './automation.service.ts';
import { matchChatbotRule, META_WINDOW_SAFE_MS } from './automation-rules.ts';
import { canAutoMessage, sendToLead } from './lead-messaging.service.ts';
import { INTERNAL_HEADER, INTERNAL_TOKEN } from '../auth/app-auth.ts';
import { automationsEnabled, dataFile } from '../config/paths.ts';

/** Placeholders the webhook/sync store for non-text messages, e.g. "[Nota de voz WhatsApp]". */
const MEDIA_PLACEHOLDER = /^\[[^\]]+\]$/;
const MEDIA_ACK =
  'Recibimos tu mensaje 🙌 En breve un asesor lo revisa. Si puedes, escríbenos tu consulta en texto (qué equipo buscas y para qué ciudad) y te respondemos de inmediato.';

export interface AutoResponderConfig {
  enabled: boolean;
  maxAgeMinutes: number; // Only auto-reply to messages younger than this (must be < 1440 for Meta 24h window)
  replyDelaySeconds: number; // Delay before sending to feel natural (default 2s)
  repliedMessageIds: string[]; // Set of already handled message IDs to prevent loops
  lastRunAt?: string;
  totalAutoRepliesSent: number;
  /** PSID -> when/why the bot was silenced for that conversation (human takeover). */
  pausedLeads: Record<string, { at: string; reason: string }>;
  /** Hours a pause lasts before the bot may answer that customer again. */
  pauseHours: number;
  /** messageKey -> failed send attempts; after MAX_ATTEMPTS the message is given up. */
  failedAttempts: Record<string, number>;
  /** PSID -> last time the canned fallback (AI unavailable) was sent. */
  lastFallbackAt: Record<string, string>;
}

export type ReplySource = 'rule' | 'ai' | 'fallback';

const CONFIG_PATH = dataFile('facebook-auto-responder.json');
const MAX_ATTEMPTS = 3;
const FALLBACK_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const toPsid = (leadIdOrPsid: string) => String(leadIdOrPsid || '').replace(/^lead-/, '');

const defaultConfig = (): AutoResponderConfig => ({
  enabled: true,
  maxAgeMinutes: 180, // Last 3 hours
  replyDelaySeconds: 2,
  repliedMessageIds: [],
  totalAutoRepliesSent: 0,
  pausedLeads: {},
  pauseHours: 12,
  failedAttempts: {},
  lastFallbackAt: {},
});

/**
 * Auto-responder for Messenger and WhatsApp Cloud API conversations
 * (kept under its historical name so existing imports keep working).
 */
export class FacebookAutoResponderService {
  private static isProcessing = false;
  /** Messages currently being answered (webhook and 30s loop can see the same message). */
  private static inFlight = new Set<string>();

  static getConfig(): AutoResponderConfig {
    const defaults = defaultConfig();
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        return {
          ...defaults,
          ...parsed,
          repliedMessageIds: parsed.repliedMessageIds || [],
          pausedLeads: parsed.pausedLeads || {},
          failedAttempts: parsed.failedAttempts || {},
          lastFallbackAt: parsed.lastFallbackAt || {},
        };
      }
    } catch (err) {
      console.warn('[AutoResponder] Error loading config, using defaults:', err);
    }
    return defaults;
  }

  static updateConfig(partial: Partial<AutoResponderConfig>): AutoResponderConfig {
    const current = this.getConfig();
    const updated = { ...current, ...partial };
    try {
      const dir = path.dirname(CONFIG_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf-8');
    } catch (err) {
      console.error('[AutoResponder] Error saving config:', err);
    }
    return updated;
  }

  /**
   * Records that a message needs no further handling. `countAsSent` is false when the bot
   * gave up (repeated failures, fallback cooldown) so the stats stay honest.
   */
  private static markMessageHandled(messageId: string, countAsSent: boolean): void {
    const config = this.getConfig();
    if (!config.repliedMessageIds.includes(messageId)) {
      config.repliedMessageIds.push(messageId);
      // Keep only last 500 IDs to avoid unbounded file growth
      if (config.repliedMessageIds.length > 500) {
        config.repliedMessageIds = config.repliedMessageIds.slice(-500);
      }
    }
    delete config.failedAttempts[messageId];
    if (countAsSent) config.totalAutoRepliesSent = (config.totalAutoRepliesSent || 0) + 1;
    config.lastRunAt = new Date().toISOString();
    this.updateConfig(config);
  }

  /** Counts one more failed attempt for this message and returns the total. */
  private static recordFailure(messageId: string): number {
    const config = this.getConfig();
    const attempts = (config.failedAttempts[messageId] || 0) + 1;
    config.failedAttempts[messageId] = attempts;
    this.updateConfig(config);
    return attempts;
  }

  // ------------------------------------------------------------ human takeover

  static pauseLead(leadIdOrPsid: string, reason = 'Pausado manualmente'): void {
    const psid = toPsid(leadIdOrPsid);
    if (!psid) return;
    const config = this.getConfig();
    config.pausedLeads[psid] = { at: new Date().toISOString(), reason };
    this.updateConfig(config);
  }

  static resumeLead(leadIdOrPsid: string): void {
    const config = this.getConfig();
    delete config.pausedLeads[toPsid(leadIdOrPsid)];
    this.updateConfig(config);
  }

  static isLeadPaused(leadIdOrPsid: string, config = this.getConfig()): boolean {
    const pause = config.pausedLeads[toPsid(leadIdOrPsid)];
    if (!pause) return false;
    return Date.now() - new Date(pause.at).getTime() < config.pauseHours * 60 * 60 * 1000;
  }

  // ------------------------------------------------------------------ replies

  /**
   * Builds the reply: chatbot rules first, then the MetaCloser AI Live-Chat API,
   * then a canned consultative fallback.
   */
  static async generateReply(
    lead: Lead,
    customerMessage: string
  ): Promise<{ text: string; source: ReplySource; transferToAgent?: boolean }> {
    // 1. Chatbot rules configured in the Automation Suite take priority over the AI.
    const chatbot = AutomationService.getData().chatbot;
    if (chatbot.enabled) {
      const rule = matchChatbotRule(customerMessage, chatbot.rules);
      if (rule) {
        return { text: rule.reply, source: 'rule', transferToAgent: rule.action === 'transfer_agent' };
      }
    }

    const port = process.env.PORT || 3000;
    const apiUrl = `http://localhost:${port}/api/ai/live-chat`;

    // Attempt to match product from local products catalog
    let matchedProduct: any = null;
    try {
      const prodPath = dataFile('local-products.json');
      if (fs.existsSync(prodPath)) {
        const products = JSON.parse(fs.readFileSync(prodPath, 'utf-8'));
        const lowerMsg = customerMessage.toLowerCase();
        matchedProduct = products.find((p: any) => {
          const pName = (p.name || '').toLowerCase();
          if (!pName) return false;
          return lowerMsg.includes(pName) ||
            (lowerMsg.includes('3 quemad') && pName.includes('3 quemad')) ||
            (lowerMsg.includes('2 quemad') && pName.includes('2 quemad')) ||
            (lowerMsg.includes('horno') && pName.includes('horno')) ||
            (lowerMsg.includes('asador') && pName.includes('asador')) ||
            (lowerMsg.includes('freidora') && pName.includes('freidora')) ||
            (lowerMsg.includes('lavabo') && pName.includes('lavabo')) ||
            (lowerMsg.includes('self') && pName.includes('self'));
        });
      }
    } catch (e) {}

    // 2. AI reply
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        // Internal call to our own API: authenticated with the per-process token.
        headers: { 'Content-Type': 'application/json', [INTERNAL_HEADER]: INTERNAL_TOKEN },
        body: JSON.stringify({
          lead: { name: lead.name, channel: lead.channel === 'whatsapp' ? 'WhatsApp' : lead.channel === 'instagram' ? 'Instagram Direct' : 'Facebook Messenger' },
          userMessage: customerMessage,
          conversationHistory: (lead.conversationHistory || []).slice(-30),
          product: matchedProduct,
          mode: 'customer_reply',
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const reply = json.data?.replyText || json.data?.respuesta_generada;
        if (reply && reply.trim()) {
          return { text: reply.trim(), source: 'ai' };
        }
      }
    } catch (fetchErr) {
      console.warn('[AutoResponder] Error calling /api/ai/live-chat, falling back to smart reply:', fetchErr);
    }

    // 3. High quality consultative fallback if API request failed (gente fina & time-aware)
    const rawName = (lead.name || '').trim();
    const isGeneric = !rawName || /^(cliente(\s*\d+)?|prospecto(\s*\d+)?|lead(\s*\d+)?|usuario|amigo\/a)$/i.test(rawName);
    const cleanName = isGeneric ? '' : rawName.split(' ')[0];

    let timeGreeting = 'Buenas tardes';
    try {
      const h = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Guayaquil' })).getHours();
      timeGreeting = h >= 5 && h < 12 ? 'Buenos días' : (h >= 12 && h < 19 ? 'Buenas tardes' : 'Buenas noches');
    } catch {}

    const greeting = cleanName
      ? `${timeGreeting}, estimado/a ${cleanName}. Mucho gusto en saludarle.`
      : `${timeGreeting}, estimado/a. Mucho gusto en saludarle.`;

    const alreadySaidWeb = (lead.conversationHistory || []).some(m => (m.content || '').includes('amecocinas.com'));
    if (alreadySaidWeb) {
      return {
        source: 'fallback',
        text: `${greeting} De parte de APM Inox, con todo respeto y agrado le confirmamos que somos fabricantes directos de equipos en acero inoxidable quirúrgico T-304 con garantía formal de fábrica en Quito.\n\nPara brindarle una cotización precisa y acordes a las dimensiones de su espacio, le invitamos cordialmente a comunicarse con nuestro taller al 09920350548 o facilitarnos su número telefónico. ¿Para qué tipo de proyecto o ciudad requiere el equipo? Quedo a su entera y grata disposición, hasta luego.`,
      };
    }
    return {
      source: 'fallback',
      text: `${greeting} De parte de APM Inox, con todo respeto y agrado le confirmamos que somos fabricantes directos de cocinas industriales y equipos gastronómicos en acero inoxidable T-304 con garantía de fábrica en Quito.\n\nCon mucho gusto le invito a conocer nuestro catálogo en línea: https://amecocinas.com/ o comunicarse al 09920350548 para atenderle personalmente. ¿Para qué ciudad o proyecto requiere el equipo? Quedo a sus gratas órdenes, hasta luego.`,
    };
  }

  /**
   * Responds to a single incoming message from a customer
   */
  static async handleIncomingMessage(params: {
    lead: Lead;
    customerPsid: string;
    messageText: string;
    messageId?: string;
  }): Promise<{ success: boolean; replySent?: string; error?: string }> {
    const config = this.getConfig();
    if (!config.enabled) {
      return { success: false, error: 'AutoResponder is disabled in settings' };
    }
    if (!automationsEnabled()) {
      return { success: false, error: 'AUTOMATIONS_ENABLED=false on this instance' };
    }

    const { lead, customerPsid, messageText, messageId } = params;
    const msgKey = messageId || `${customerPsid}_${messageText}_${lead.lastActivity}`;

    if (config.repliedMessageIds.includes(msgKey)) {
      return { success: false, error: 'Already replied' };
    }
    if (this.isLeadPaused(customerPsid, config)) {
      return { success: false, error: 'Conversation paused: a human advisor is handling it' };
    }
    const allowed = canAutoMessage(lead);
    if (!allowed.ok) {
      return { success: false, error: allowed.reason };
    }
    if (this.inFlight.has(msgKey)) {
      return { success: false, error: 'Already being answered' };
    }
    this.inFlight.add(msgKey);

    try {
      return await this.answer(lead, customerPsid, messageText, msgKey, config);
    } finally {
      this.inFlight.delete(msgKey);
    }
  }

  private static async answer(
    lead: Lead,
    customerPsid: string,
    messageText: string,
    msgKey: string,
    config: AutoResponderConfig
  ): Promise<{ success: boolean; replySent?: string; error?: string }> {
    console.log(`[AutoResponder] 🤖 Auto-replying on ${lead.channel} to ${lead.name} (${customerPsid}): "${messageText}"`);

    // Natural delay; also lets a burst of short messages ("hola" / "precio?" / "de la cocina")
    // arrive so we answer once, to the last one, with the whole context.
    if (config.replyDelaySeconds > 0) {
      await new Promise((r) => setTimeout(r, config.replyDelaySeconds * 1000));
    }

    const freshLead = FacebookSyncService.loadSavedLeads().find((l) => l.id === lead.id) || lead;
    const history = freshLead.conversationHistory || [];
    const last = history[history.length - 1];
    if (last && last.sender === 'customer' && last.id && last.id !== msgKey && history.some((m) => m.id === msgKey)) {
      // A newer customer message arrived meanwhile; it will be answered instead.
      this.markMessageHandled(msgKey, false);
      return { success: false, error: 'Superseded by a newer customer message' };
    }
    if (last && last.sender !== 'customer' && history.some((m) => m.id === msgKey)) {
      // Someone (advisor or another process) already answered after this message.
      this.markMessageHandled(msgKey, false);
      return { success: false, error: 'Already answered' };
    }

    try {
      const reply = MEDIA_PLACEHOLDER.test(messageText.trim())
        ? { text: MEDIA_ACK, source: 'rule' as ReplySource }
        : await this.generateReply(freshLead, messageText);

      // The AI is down: send the canned message at most once every few hours per customer,
      // instead of repeating the same paragraph to every message.
      if (reply.source === 'fallback') {
        const last = config.lastFallbackAt[customerPsid];
        if (last && Date.now() - new Date(last).getTime() < FALLBACK_COOLDOWN_MS) {
          this.markMessageHandled(msgKey, false);
          return { success: false, error: 'AI unavailable; fallback already sent recently' };
        }
      }

      console.log(`[AutoResponder] Dispatching (${reply.source}) via ${freshLead.channel} to ${freshLead.name}: "${reply.text.substring(0, 50)}..."`);
      await sendToLead(freshLead, reply.text);
      this.markMessageHandled(msgKey, true);

      if (reply.source === 'fallback') {
        const c = this.getConfig();
        c.lastFallbackAt[customerPsid] = new Date().toISOString();
        this.updateConfig(c);
      }
      if (reply.transferToAgent) {
        this.pauseLead(customerPsid, 'El cliente pidió un asesor humano');
      }

      return { success: true, replySent: reply.text };
    } catch (err: any) {
      const message = err?.message || String(err);
      const attempts = this.recordFailure(msgKey);
      console.error(`[AutoResponder] Failed to auto-reply to ${customerPsid} (attempt ${attempts}/${MAX_ATTEMPTS}):`, message);
      if (attempts >= MAX_ATTEMPTS) {
        console.warn(`[AutoResponder] Giving up on message ${msgKey} after ${MAX_ATTEMPTS} attempts.`);
        this.markMessageHandled(msgKey, false);
      }
      return { success: false, error: message };
    }
  }

  /**
   * Scans all recently synced leads and auto-replies to any unreplied customer message
   * that was received within maxAgeMinutes (and within Meta 24-hour window)
   */
  static async processUnrepliedConversations(): Promise<{ processed: number; sent: number }> {
    const config = this.getConfig();
    if (!config.enabled || this.isProcessing) {
      return { processed: 0, sent: 0 };
    }

    this.isProcessing = true;
    let sentCount = 0;
    let processedCount = 0;

    try {
      const leads = FacebookSyncService.loadSavedLeads();
      const nowMs = Date.now();
      const maxAgeMs = config.maxAgeMinutes * 60 * 1000;

      for (const lead of leads) {
        if (!lead.externalUserId) continue;
        if (this.isLeadPaused(lead.externalUserId, config)) continue; // a human is handling it
        if (!canAutoMessage(lead).ok) continue; // e.g. personal WhatsApp Web chats

        const history = lead.conversationHistory || [];
        if (history.length === 0) continue;

        const lastMsg = history[history.length - 1];
        // Only if the last message is from the customer
        if (lastMsg.sender !== 'customer' || !lastMsg.content) continue;

        // Check age of message
        const msgDateMs = lastMsg.createdAt ? new Date(lastMsg.createdAt).getTime() : 0;
        if (msgDateMs === 0) continue;

        const ageMs = nowMs - msgDateMs;

        // Must be younger than maxAgeMs and within Meta 24h window (never older than 23h)
        if (ageMs > maxAgeMs || ageMs > META_WINDOW_SAFE_MS) continue;

        const msgKey = lastMsg.id || `${lead.externalUserId}_${lastMsg.content}_${lastMsg.createdAt}`;
        if (config.repliedMessageIds.includes(msgKey)) continue;

        processedCount++;
        const res = await this.handleIncomingMessage({
          lead,
          customerPsid: lead.externalUserId,
          messageText: lastMsg.content,
          messageId: msgKey,
        });

        if (res.success) {
          sentCount++;
          // Small pause between multiple messages to avoid burst limits
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    } catch (e) {
      console.error('[AutoResponder] Error in processUnrepliedConversations:', e);
    } finally {
      this.isProcessing = false;
    }

    return { processed: processedCount, sent: sentCount };
  }
}
