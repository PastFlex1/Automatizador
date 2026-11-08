import fs from 'node:fs';
import path from 'node:path';
import type { Lead } from '../types.ts';
import { FacebookSyncService } from './facebook-sync.service.ts';
import { canAutoMessage, sendToLead } from './lead-messaging.service.ts';
import { dataFile } from '../config/paths.ts';
import {
  ChatbotConfig,
  TemplateVars,
  interpolateTemplate,
  isWithinMessagingWindow,
  normalizeChatbotConfig,
} from './automation-rules.ts';

export type { ChatbotConfig, ChatbotRule } from './automation-rules.ts';

export interface MessagingTemplate {
  id: string;
  title: string;
  category: string;
  channel: 'whatsapp' | 'messenger' | 'instagram' | 'all';
  content: string;
  tags?: string[];
}

export interface DripStep {
  day: number;
  trigger: string;
  title: string;
  message: string;
}

export interface DripCampaign {
  id: string;
  name: string;
  description: string;
  active: boolean;
  steps: DripStep[];
}

export type BroadcastStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';

export interface BroadcastCampaign {
  id: string;
  title: string;
  targetAudience: string;
  sentCount: number;
  failedCount?: number;
  eligibleCount?: number;
  skippedOutsideWindow?: number;
  status: BroadcastStatus;
  createdAt: string;
  finishedAt?: string;
  delaySeconds: number;
  message: string;
  lastError?: string;
}

export interface DripLogEntry {
  step: number; // 1-based
  at: string;
  result: 'sent' | 'failed' | 'skipped_window' | 'skipped_missed' | 'skipped_channel';
  detail?: string;
}

export interface DripEnrollment {
  dripId: string;
  currentStep: number; // 1-based index of the NEXT step to send
  enrolledAt: string;
  status: 'active' | 'completed' | 'paused' | 'expired';
  log?: DripLogEntry[];
}

export interface AutomationsData {
  templates: MessagingTemplate[];
  dripCampaigns: DripCampaign[];
  chatbot: ChatbotConfig;
  broadcasts: BroadcastCampaign[];
  assignedDrips: Record<string, DripEnrollment>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 2000; // Messenger text limit
const CLOSED_STATUSES = new Set(['won_closed', 'lost']);

export class AutomationService {
  private static DATA_PATH = dataFile('local-automations.json');
  private static PRODUCTS_PATH = dataFile('local-products.json');
  private static broadcastRunning = false;
  private static dripProcessing = false;

  private static emptyData(): AutomationsData {
    return {
      templates: [],
      dripCampaigns: [],
      chatbot: { enabled: true, welcomeMessage: '', rules: [] },
      broadcasts: [],
      assignedDrips: {},
    };
  }

  static getData(): AutomationsData {
    if (!fs.existsSync(this.DATA_PATH)) return this.emptyData();
    try {
      const data = JSON.parse(fs.readFileSync(this.DATA_PATH, 'utf8'));
      return {
        templates: data.templates || [],
        dripCampaigns: data.dripCampaigns || [],
        chatbot: normalizeChatbotConfig(data.chatbot),
        broadcasts: data.broadcasts || [],
        assignedDrips: data.assignedDrips || {},
      };
    } catch (err) {
      console.error('[AutomationService] Error reading automations data:', err);
      return this.emptyData();
    }
  }

  static saveData(data: AutomationsData): void {
    // Write to a temp file then rename so a crash mid-write never corrupts the JSON.
    const tmp = `${this.DATA_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, this.DATA_PATH);
  }

  static interpolateTemplate(content: string, vars: TemplateVars): string {
    return interpolateTemplate(content, vars);
  }

  // ---------------------------------------------------------------- templates

  static saveTemplate(template: Partial<MessagingTemplate>): MessagingTemplate {
    const data = this.getData();
    if (template.id) {
      const idx = data.templates.findIndex((t) => t.id === template.id);
      if (idx >= 0) {
        data.templates[idx] = { ...data.templates[idx], ...template } as MessagingTemplate;
        this.saveData(data);
        return data.templates[idx];
      }
    }

    const newTemplate: MessagingTemplate = {
      id: `tpl-${Date.now()}`,
      title: template.title || 'Nueva Plantilla',
      category: template.category || 'General',
      channel: template.channel || 'whatsapp',
      content: template.content || '',
      tags: template.tags || [],
    };
    data.templates.unshift(newTemplate);
    this.saveData(data);
    return newTemplate;
  }

  static deleteTemplate(id: string): boolean {
    const data = this.getData();
    const initLen = data.templates.length;
    data.templates = data.templates.filter((t) => t.id !== id);
    if (data.templates.length !== initLen) {
      this.saveData(data);
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ chatbot

  static updateChatbot(config: Partial<ChatbotConfig>): ChatbotConfig {
    const data = this.getData();
    const merged = normalizeChatbotConfig({ ...data.chatbot, ...config });
    merged.rules = merged.rules
      .filter((r) => r && r.reply && r.reply.trim())
      .map((r) => ({
        id: String(r.id || Date.now()),
        name: String(r.name || 'Regla'),
        keywords: String(r.keywords || ''),
        reply: String(r.reply),
        action: ['send_message', 'recommend_product', 'transfer_agent'].includes(r.action) ? r.action : 'send_message',
      }));
    data.chatbot = merged;
    this.saveData(data);
    return data.chatbot;
  }

  // -------------------------------------------------------------------- drips

  static enrollLeadInDrip(leadId: string, dripId: string): DripEnrollment {
    if (!leadId || typeof leadId !== 'string') throw new Error('leadId es obligatorio');
    const data = this.getData();
    const drip = data.dripCampaigns.find((d) => d.id === dripId);
    if (!drip) throw new Error(`No existe la secuencia drip "${dripId}"`);

    data.assignedDrips[leadId] = {
      dripId,
      currentStep: 1,
      enrolledAt: new Date().toISOString(),
      status: 'active',
      log: [],
    };
    this.saveData(data);
    return data.assignedDrips[leadId];
  }

  private static loadProducts(): any[] {
    try {
      if (fs.existsSync(this.PRODUCTS_PATH)) return JSON.parse(fs.readFileSync(this.PRODUCTS_PATH, 'utf8'));
    } catch {}
    return [];
  }

  static varsForLead(lead: Lead | undefined, products = this.loadProducts()): TemplateVars {
    if (!lead) return {};
    const product = lead.interestProductId ? products.find((p) => p.id === lead.interestProductId) : undefined;
    const rawName = (lead.name || '').trim();
    const isGeneric = !rawName || /^(cliente|prospecto|lead|usuario)\b/i.test(rawName);
    return {
      cliente: isGeneric ? undefined : rawName.split(' ')[0],
      equipo: product?.name,
      precio: typeof product?.price === 'number' ? product.price : undefined,
    };
  }

  /**
   * Sends the drip step that is due today for each active enrollment.
   * - Day 1 = enrollment day. A step is due on its `day` and has a 1-day grace period;
   *   after that it is skipped (never sends a backlog of old steps in a burst).
   * - Only Messenger leads inside Meta's 24h window can be messaged by API; otherwise the
   *   step is logged as skipped so the advisor can follow up manually.
   * - At most one step per lead per run.
   */
  static async processDueDrips(): Promise<{ sent: number; skipped: number }> {
    if (this.dripProcessing) return { sent: 0, skipped: 0 };
    this.dripProcessing = true;
    let sent = 0;
    let skipped = 0;

    try {
      const snapshot = this.getData();
      const leads = FacebookSyncService.loadSavedLeads();
      const products = this.loadProducts();
      const now = Date.now();

      for (const [leadId, enrollment] of Object.entries(snapshot.assignedDrips)) {
        if (enrollment.status !== 'active') continue;
        const drip = snapshot.dripCampaigns.find((d) => d.id === enrollment.dripId);
        const steps = [...(drip?.steps || [])].sort((a, b) => a.day - b.day);
        const step = steps[enrollment.currentStep - 1];

        let logEntry: DripLogEntry | null = null;
        let newStatus: DripEnrollment['status'] = enrollment.status;
        let advance = false;

        if (!drip || !step) {
          newStatus = 'completed';
        } else {
          const dayNumber = Math.floor((now - new Date(enrollment.enrolledAt).getTime()) / DAY_MS) + 1;
          if (dayNumber < step.day) continue; // not due yet

          const stepNo = enrollment.currentStep;
          const lead = leads.find((l) => l.id === leadId || l.externalUserId === leadId.replace(/^lead-/, ''));
          advance = true;

          if (dayNumber > step.day + 1) {
            logEntry = { step: stepNo, at: new Date().toISOString(), result: 'skipped_missed', detail: `Debía enviarse el día ${step.day}` };
          } else if (!lead || !canAutoMessage(lead).ok) {
            logEntry = {
              step: stepNo,
              at: new Date().toISOString(),
              result: 'skipped_channel',
              detail: `${lead ? canAutoMessage(lead).reason : 'Lead no encontrado'}; envíalo manualmente.`,
            };
          } else if (!isWithinMessagingWindow(lead.conversationHistory)) {
            logEntry = { step: stepNo, at: new Date().toISOString(), result: 'skipped_window', detail: 'Ventana de 24h de Meta cerrada; envíalo manualmente.' };
          } else {
            const text = interpolateTemplate(step.message, this.varsForLead(lead, products));
            try {
              await sendToLead(lead, text);
              logEntry = { step: stepNo, at: new Date().toISOString(), result: 'sent' };
              sent++;
            } catch (e: any) {
              logEntry = { step: stepNo, at: new Date().toISOString(), result: 'failed', detail: e?.message || String(e) };
            }
          }
          if (logEntry && logEntry.result !== 'sent') skipped++;
          if (enrollment.currentStep >= steps.length) newStatus = 'completed';
        }

        // Re-read right before writing: the await above may have let other writers run.
        const fresh = this.getData();
        const current = fresh.assignedDrips[leadId];
        if (!current || current.enrolledAt !== enrollment.enrolledAt) continue; // re-enrolled meanwhile
        if (advance) current.currentStep = enrollment.currentStep + 1;
        if (logEntry) current.log = [...(current.log || []), logEntry].slice(-20);
        current.status = newStatus;
        this.saveData(fresh);
      }
    } catch (e) {
      console.error('[AutomationService] Error processing drips:', e);
    } finally {
      this.dripProcessing = false;
    }
    return { sent, skipped };
  }

  // ---------------------------------------------------------------- broadcast

  static getBroadcast(id: string): BroadcastCampaign | undefined {
    return this.getData().broadcasts.find((b) => b.id === id);
  }

  private static updateBroadcast(id: string, patch: Partial<BroadcastCampaign>): void {
    const data = this.getData();
    const b = data.broadcasts.find((x) => x.id === id);
    if (!b) return;
    Object.assign(b, patch);
    this.saveData(data);
  }

  /** Marks broadcasts left RUNNING by a server restart as cancelled. */
  static recoverInterruptedBroadcasts(): void {
    const data = this.getData();
    let changed = false;
    for (const b of data.broadcasts) {
      if (b.status === 'RUNNING' || b.status === 'PENDING') {
        b.status = 'CANCELLED';
        b.lastError = 'Interrumpida por reinicio del servidor';
        changed = true;
      }
    }
    if (changed) this.saveData(data);
  }

  /**
   * Validates, selects the audience and starts sending in the background.
   * Only Messenger leads inside the 24h window are messaged (Meta policy for RESPONSE messages).
   */
  static startBroadcast(input: { message?: string; targetAudience?: string; delaySeconds?: number; title?: string }): BroadcastCampaign {
    const message = (input.message || '').trim();
    if (!message) throw Object.assign(new Error('El mensaje no puede estar vacío'), { status: 400 });
    if (message.length > MAX_MESSAGE_LENGTH) {
      throw Object.assign(new Error(`El mensaje supera ${MAX_MESSAGE_LENGTH} caracteres`), { status: 400 });
    }
    if (this.broadcastRunning) {
      throw Object.assign(new Error('Ya hay una difusión en curso. Espera a que termine.'), { status: 409 });
    }

    const audience = input.targetAudience === 'all_leads' ? 'all_leads' : 'leads_pending';
    const delaySeconds = Math.min(60, Math.max(5, Number(input.delaySeconds) || 12));

    const messengerLeads = FacebookSyncService.loadSavedLeads().filter(
      (l) => l.channel === 'messenger' && l.externalUserId && (audience === 'all_leads' || !CLOSED_STATUSES.has(l.status))
    );
    const eligible = messengerLeads.filter((l) => isWithinMessagingWindow(l.conversationHistory));

    const data = this.getData();
    const broadcast: BroadcastCampaign = {
      id: `bc-${Date.now()}`,
      title: input.title || `Difusión ${new Date().toLocaleDateString('es-EC')}`,
      targetAudience: audience === 'all_leads' ? 'Toda la base de Messenger' : 'Prospectos activos de Messenger',
      sentCount: 0,
      failedCount: 0,
      eligibleCount: eligible.length,
      skippedOutsideWindow: messengerLeads.length - eligible.length,
      status: eligible.length > 0 ? 'RUNNING' : 'COMPLETED',
      createdAt: new Date().toISOString(),
      finishedAt: eligible.length > 0 ? undefined : new Date().toISOString(),
      delaySeconds,
      message,
    };
    data.broadcasts.unshift(broadcast);
    this.saveData(data);

    if (eligible.length > 0) {
      this.broadcastRunning = true;
      void this.runBroadcast(broadcast.id, eligible, message, delaySeconds);
    }
    return broadcast;
  }

  private static async runBroadcast(id: string, leads: Lead[], message: string, delaySeconds: number): Promise<void> {
    let sent = 0;
    let failed = 0;
    let lastError: string | undefined;
    try {
      for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];
        try {
          console.log(`[Broadcast ${id}] Enviando a ${lead.name} (${lead.externalUserId})...`);
          await FacebookSyncService.sendMessageToFacebook(lead.externalUserId!, message);
          sent++;
        } catch (e: any) {
          failed++;
          lastError = e?.message || String(e);
          console.error(`[Broadcast ${id}] Error con ${lead.externalUserId}:`, lastError);
        }
        this.updateBroadcast(id, { sentCount: sent, failedCount: failed, lastError });
        if (i < leads.length - 1) await new Promise((r) => setTimeout(r, delaySeconds * 1000));
      }
      this.updateBroadcast(id, {
        status: sent === 0 && failed > 0 ? 'FAILED' : 'COMPLETED',
        finishedAt: new Date().toISOString(),
      });
      console.log(`[Broadcast ${id}] Terminado: ${sent} enviados, ${failed} fallidos.`);
    } catch (e: any) {
      this.updateBroadcast(id, { status: 'FAILED', lastError: e?.message || String(e), finishedAt: new Date().toISOString() });
    } finally {
      this.broadcastRunning = false;
    }
  }
}
