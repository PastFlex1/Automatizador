import type { Lead, Message } from '../types.ts';
import { FacebookSyncService } from './facebook-sync.service.ts';
import { WhatsAppSyncService } from './whatsapp-sync.service.ts';

/** Set by the webhook on leads whose chat arrived through the official WhatsApp Cloud API. */
export const WHATSAPP_CLOUD_ACCOUNT = 'WhatsApp Cloud API: APM inox';

/**
 * WhatsApp leads can come from two places:
 *  - the official Cloud API (business number, webhook) -> can be answered automatically;
 *  - the Chrome extension on WhatsApp Web (personal number) -> must NEVER be messaged from
 *    the business number automatically, the customer would get a message from a stranger.
 */
export function isCloudWhatsAppLead(lead: Lead): boolean {
  return (
    lead.channel === 'whatsapp' &&
    !!lead.externalUserId &&
    (lead.socialAccountName || '').startsWith('WhatsApp Cloud API')
  );
}

/** Whether automations (bot, drips, broadcasts) may send to this lead through an API. */
export function canAutoMessage(lead: Lead): { ok: boolean; reason?: string } {
  if (!lead.externalUserId) return { ok: false, reason: 'El lead no tiene ID de Meta' };
  // Instagram Direct is answered through the Page with the same Send API as Messenger.
  if (lead.channel === 'messenger' || lead.channel === 'instagram') return { ok: true };
  if (lead.channel === 'whatsapp') {
    if (!isCloudWhatsAppLead(lead)) {
      return { ok: false, reason: 'Chat de WhatsApp Web (número personal): solo envío manual' };
    }
    if (!WhatsAppSyncService.isConfigured()) {
      return { ok: false, reason: 'WhatsApp Cloud API no está configurado en .env' };
    }
    return { ok: true };
  }
  return { ok: false, reason: `Canal ${lead.channel} sin envío automático` };
}

/** Appends an outgoing message to the lead's local history (the shared CRM state). */
function recordOutgoing(leadId: string, text: string, status: Message['deliveryStatus'], error?: string): void {
  const leads = FacebookSyncService.loadSavedLeads();
  const lead = leads.find((l) => l.id === leadId);
  if (!lead) return;
  const now = new Date();
  lead.conversationHistory = lead.conversationHistory || [];
  lead.conversationHistory.push({
    id: `msg-${Date.now()}`,
    sender: 'agent',
    content: text,
    timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    createdAt: now.toISOString(),
    type: 'text',
    deliveryStatus: status,
    deliveryError: error,
  });
  lead.lastMessage = text;
  lead.lastActivity = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  FacebookSyncService.saveLeads(leads);
}

/**
 * Sends a text to the lead on its own channel and records it in the CRM history.
 * Throws when the message could not be delivered.
 */
export async function sendToLead(lead: Lead, text: string): Promise<void> {
  const check = canAutoMessage(lead);
  if (!check.ok) throw new Error(check.reason);

  if (lead.channel === 'messenger' || lead.channel === 'instagram') {
    // POST /{page-id}/messages works for both a Messenger PSID and an Instagram IGSID.
    // FacebookSyncService records the message in the history itself.
    await FacebookSyncService.sendMessageToFacebook(lead.externalUserId!, text);
    return;
  }

  try {
    const result = await WhatsAppSyncService.sendMessageToWhatsApp(lead.externalUserId!, text);
    if (result?.simulated) throw new Error(result.warning || 'WhatsApp Cloud API no configurado');
    recordOutgoing(lead.id, text, 'delivered');
  } catch (e: any) {
    recordOutgoing(lead.id, text, 'failed', e?.message || String(e));
    throw e;
  }
}
