import fs from 'node:fs';
import path from 'node:path';
import { dataFile } from '../config/paths.ts';

export interface WhatsAppConfig {
  phoneNumberId: string;
  wabaId?: string;
  accessToken: string;
}

const GRAPH_VERSION = 'v21.0';

export class WhatsAppSyncService {
  private static LOCAL_STATE_FILE = dataFile('local-crm-state.json');

  static getConfig(): WhatsAppConfig {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.META_WHATSAPP_PHONE_NUMBER_ID || '';
    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || process.env.META_WABA_ID || '';
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN || '';
    return { phoneNumberId, wabaId, accessToken };
  }

  /** True when the WhatsApp Cloud API credentials are present in .env */
  static isConfigured(): boolean {
    const { phoneNumberId, accessToken } = this.getConfig();
    return !!phoneNumberId && !!accessToken;
  }

  /**
   * Send a text message to a WhatsApp user via WhatsApp Cloud API
   */
  static async sendMessageToWhatsApp(toPhoneNumber: string, text: string): Promise<any> {
    const { phoneNumberId, accessToken } = this.getConfig();

    if (!phoneNumberId || !accessToken) {
      console.warn('[WhatsApp API] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN in .env');
      return {
        success: false,
        simulated: true,
        warning: 'Falta configurar WHATSAPP_PHONE_NUMBER_ID en el archivo .env',
      };
    }

    // Clean phone number (strip +, spaces, hyphens)
    const cleanTo = toPhoneNumber.replace(/\D/g, '');

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'text',
      text: { preview_url: false, body: text },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      console.error('[WhatsApp Cloud API] Error sending message:', data);
      const code = data.error?.code;
      if (code === 131047) {
        throw new Error('Ventana de 24h cerrada en WhatsApp: solo se puede escribir con una plantilla aprobada.');
      }
      if (code === 190) {
        throw new Error('Token de WhatsApp expirado o inválido: actualiza WHATSAPP_ACCESS_TOKEN.');
      }
      throw new Error(data.error?.message || 'Error al enviar mensaje por WhatsApp Cloud API');
    }

    return data;
  }

  /** Shows the blue ticks to the customer as soon as the message arrives. Never throws. */
  static async markAsRead(messageId: string): Promise<void> {
    const { phoneNumberId, accessToken } = this.getConfig();
    if (!phoneNumberId || !accessToken || !messageId) return;
    try {
      await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (e: any) {
      console.warn('[WhatsApp Cloud API] Could not mark message as read:', e?.message || e);
    }
  }
}
