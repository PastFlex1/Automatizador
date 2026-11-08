import fs from 'fs';
import path from 'path';
import { Lead, Message } from '../types';
import { dataFile } from '../config/paths.ts';

const STORAGE_PATH = dataFile('local-crm-state.json');

export class FacebookSyncService {
  private static getCredentials() {
    const token =
      process.env.META_PAGE_ACCESS_TOKEN || ''; // never hardcode tokens: set it in .env
    const pageId = process.env.META_PAGE_ID || '1323037820891730';
    const pageName = process.env.META_PAGE_NAME || 'APM inox 1';
    return { token, pageId, pageName };
  }

  static loadSavedLeads(): Lead[] {
    try {
      if (fs.existsSync(STORAGE_PATH)) {
        const raw = fs.readFileSync(STORAGE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[FacebookSync] Could not read local-crm-state.json:', e);
    }
    return [];
  }

  static saveLeads(leads: Lead[]): void {
    try {
      const dir = path.dirname(STORAGE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(STORAGE_PATH, JSON.stringify(leads, null, 2), 'utf-8');
    } catch (e) {
      console.error('[FacebookSync] Error saving local-crm-state.json:', e);
    }
  }

  /** Syncs Messenger and then Instagram Direct (each one independently of the other's errors). */
  private static warnedMissingToken = false;

  static async syncAllConversations(): Promise<{ success: boolean; count: number; totalMessages: number }> {
    if (!this.getCredentials().token) {
      if (!this.warnedMissingToken) {
        console.warn('[FacebookSync] META_PAGE_ACCESS_TOKEN no está en .env: Messenger e Instagram no se sincronizan.');
        this.warnedMissingToken = true;
      }
      return { success: false, count: this.loadSavedLeads().length, totalMessages: 0 };
    }
    const messenger = await this.syncMessengerConversations();
    let instagram = { success: false, count: 0, totalMessages: 0 };
    try {
      instagram = await this.syncInstagramConversations();
    } catch (e: any) {
      console.warn('[InstagramSync] Error:', e?.message || e);
    }
    return {
      success: messenger.success || instagram.success,
      count: this.loadSavedLeads().length,
      totalMessages: messenger.totalMessages + instagram.totalMessages,
    };
  }

  // ------------------------------------------------------------------ Instagram

  private static igAccountId: string | null | undefined; // undefined = not looked up yet

  /** Instagram professional account linked to the Facebook Page (null if none). */
  static async getInstagramAccountId(): Promise<string | null> {
    if (this.igAccountId !== undefined) return this.igAccountId;
    if (process.env.META_INSTAGRAM_ACCOUNT_ID) return (this.igAccountId = process.env.META_INSTAGRAM_ACCOUNT_ID);
    const { token, pageId } = this.getCredentials();
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}?fields=instagram_business_account&access_token=${token}`, {
        signal: AbortSignal.timeout(15000),
      });
      const json: any = await res.json();
      if (!res.ok) {
        console.warn('[InstagramSync] Could not read the Instagram account linked to the page:', json?.error?.message);
        return null; // retry on next sync
      }
      this.igAccountId = json.instagram_business_account?.id || null;
      if (!this.igAccountId) console.warn('[InstagramSync] The Facebook page has no linked Instagram professional account.');
      return this.igAccountId;
    } catch (e: any) {
      console.warn('[InstagramSync] Network error looking up Instagram account:', e?.message || e);
      return null;
    }
  }

  /**
   * Instagram Direct conversations through the Page (Messenger API for Instagram).
   * Needs the page token with instagram_basic + instagram_manage_messages and
   * "Allow access to messages" enabled in the Instagram app.
   */
  static async syncInstagramConversations(): Promise<{ success: boolean; count: number; totalMessages: number }> {
    const igId = await this.getInstagramAccountId();
    if (!igId) return { success: false, count: 0, totalMessages: 0 };
    const { token, pageId, pageName } = this.getCredentials();

    const url =
      `https://graph.facebook.com/v21.0/${pageId}/conversations?platform=instagram` +
      `&fields=id,updated_time,participants,messages.limit(8){id,message,created_time,from}` +
      `&limit=15&access_token=${token}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[InstagramSync] Graph API error:', json?.error?.message || res.status);
      return { success: false, count: 0, totalMessages: 0 };
    }

    const leads = this.loadSavedLeads();
    let totalMessages = 0;
    let count = 0;

    for (const conv of json.data || []) {
      const participants: any[] = conv.participants?.data || [];
      const customer = participants.find((p) => p.id !== igId && p.id !== pageId);
      if (!customer?.id) continue;

      const igsid = String(customer.id);
      const username = customer.username || customer.name || '';
      const displayName = username ? `@${username}` : `Instagram (${igsid.slice(-4)})`;

      const fetched: Message[] = (conv.messages?.data || [])
        .filter((m: any) => m.message)
        .reverse()
        .map((m: any) => {
          const d = m.created_time ? new Date(m.created_time) : new Date();
          return {
            id: m.id,
            sender: m.from?.id === igId || m.from?.id === pageId ? 'agent' : 'customer',
            content: m.message,
            timestamp: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            createdAt: d.toISOString(),
            type: 'text',
          } as Message;
        });
      totalMessages += fetched.length;

      let lead = leads.find((l) => l.externalUserId === igsid || l.id === `lead-${igsid}`);
      if (!lead) {
        lead = {
          id: `lead-${igsid}`,
          name: displayName,
          roleCompany: 'Cliente Potencial - Instagram Direct',
          dealCode: `IG-${igsid.slice(-6)}`,
          manager: 'Asesor Comercial',
          email: `${igsid}@instagram.com`,
          handleOrPhone: username ? `@${username}` : `ID: ${igsid}`,
          avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(username || 'IG')}&background=E1306C&color=ffffff&bold=true&size=256`,
          channel: 'instagram',
          pageName,
          socialAccountName: `Instagram de ${pageName}`,
          externalUserId: igsid,
          status: 'new_lead',
          urgency: 'hot',
          intentScore: 80,
          estimatedValue: 250,
          tags: ['Instagram', pageName, 'Inbound'],
          lastMessage: '',
          lastActivity: '',
          unreadCount: 0,
          notes: `Prospecto contactado por Instagram Direct (${pageName}).`,
          conversationHistory: [],
        };
        leads.unshift(lead);
      } else {
        lead.channel = 'instagram'; // fixes chats the old webhook stored as "messenger"
        if (username && /^Cliente \(|^Instagram \(/.test(lead.name)) lead.name = displayName;
        if (username) lead.handleOrPhone = `@${username}`;
      }

      // Merge: keep local-only messages (e.g. just sent by the bot), add new ones from Meta.
      const history = lead.conversationHistory || [];
      const known = new Set(history.map((m) => m.id));
      for (const m of fetched) {
        const dup = known.has(m.id) || history.some((h) => h.content === m.content && h.sender === m.sender &&
          Math.abs(new Date(h.createdAt || 0).getTime() - new Date(m.createdAt || 0).getTime()) < 120000);
        if (!dup) history.push(m);
      }
      history.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
      lead.conversationHistory = history;
      const last = history[history.length - 1];
      if (last) {
        lead.lastMessage = last.content;
        lead.lastActivity = last.timestamp;
      }
      count++;
    }

    this.saveLeads(leads);
    return { success: true, count, totalMessages };
  }

  // ------------------------------------------------------------------ Messenger

  private static async syncMessengerConversations(): Promise<{ success: boolean; count: number; totalMessages: number }> {
    const { token, pageId, pageName } = this.getCredentials();

    // Start with safe lightweight batch limits (15 convs, 8 msgs) to avoid Meta Graph API timeouts
    let msgLimit = 8;
    let convLimit = 15;
    let url: string | null = `https://graph.facebook.com/v21.0/${pageId}/conversations?fields=id,snippet,updated_time,unread_count,senders,messages.limit(${msgLimit}){id,message,created_time,from}&limit=${convLimit}&access_token=${token}`;
    const allRawConvs: any[] = [];
    let totalMessages = 0;

    try {
      while (url && allRawConvs.length < 150) {
        const res = await fetch(url);
        if (!res.ok) {
          const errData: any = await res.json().catch(() => ({}));
          const errMsg = errData.error?.message || '';
          const errCode = errData.error?.code;
          const isTransient = errData.error?.is_transient;

          // If Meta asks to reduce data (code 1) or is temporarily overloaded (code 2 / transient):
          if (errCode === 1 || errCode === 2 || isTransient || errMsg.toLowerCase().includes('reduce the amount of data')) {
            console.warn(`[FacebookSync] Meta solicitó consulta ligera (code ${errCode || 'transient'}). Cambiando a consulta ultra-rápida sin joins...`);

            // Ultra-lightweight fallback: Query conversations without nested message join
            const shallowUrl = `https://graph.facebook.com/v21.0/${pageId}/conversations?fields=id,snippet,updated_time,unread_count,senders&limit=${convLimit}&access_token=${token}`;
            const shallowRes = await fetch(shallowUrl);
            if (shallowRes.ok) {
              const shallowJson = await shallowRes.json();
              const shallowBatch = shallowJson.data || [];

              // For top 10 conversations, fetch recent messages individually
              for (const conv of shallowBatch.slice(0, 10)) {
                try {
                  const mRes = await fetch(`https://graph.facebook.com/v21.0/${conv.id}/messages?fields=id,message,created_time,from&limit=8&access_token=${token}`);
                  if (mRes.ok) {
                    const mJson = await mRes.json();
                    conv.messages = { data: mJson.data || [] };
                  }
                } catch (e) {}
              }

              allRawConvs.push(...shallowBatch);
            } else {
              const shallowErr = await shallowRes.json().catch(() => ({}));
              console.warn('[FacebookSync] Meta Graph API temporalmente no disponible (is_transient). Manteniendo caché local segura:', shallowErr?.error?.message || 'Timeout en Meta');
            }
            break;
          }

          console.error('[FacebookSync] Graph API error:', errData);
          break;
        }

        const json = await res.json();
        const batch = json.data || [];
        allRawConvs.push(...batch);

        url = json.paging && json.paging.next ? json.paging.next : null;
      }
    } catch (netErr) {
      console.error('[FacebookSync] Network error fetching conversations:', netErr);
    }

    if (allRawConvs.length === 0) {
      return { success: false, count: 0, totalMessages: 0 };
    }

    const existingLeads = this.loadSavedLeads();
    const existingMap = new Map<string, Lead>(existingLeads.map((l) => [l.externalUserId || l.id, l]));

    const syncedLeads: Lead[] = [];

    for (const rawConv of allRawConvs) {
      const senders = rawConv.senders?.data || [];
      const customer = senders.find((s: any) => s.id !== pageId) || senders[0];
      if (!customer) continue;

      const customerPsid = customer.id;
      const customerName = customer.name || `Prospecto (${customerPsid.slice(-4)})`;
      const leadId = `lead-${customerPsid}`;
      const existing = existingMap.get(customerPsid) || existingMap.get(leadId);

      // Order messages chronologically
      const rawMsgs = (rawConv.messages?.data || []).filter((m: any) => m.message);
      const chronologicalMsgs = [...rawMsgs].reverse();
      totalMessages += chronologicalMsgs.length;

      const history: Message[] = chronologicalMsgs.map((m: any) => {
        const isFromPage = m.from?.id === pageId;
        const msgDate = m.created_time ? new Date(m.created_time) : new Date();
        return {
          id: m.id || `msg-${Math.random().toString(36).substr(2, 9)}`,
          sender: isFromPage ? 'agent' : 'customer',
          content: m.message,
          timestamp: msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          createdAt: msgDate.toISOString(),
          type: 'text',
        };
      });

      // Intelligently merge conversation history so local messages are preserved
      const existingHistory = existing?.conversationHistory || [];
      const historyIds = new Set(history.map((m) => m.id));
      const combinedHistory = [...history];

      for (const oldMsg of existingHistory) {
        if (!historyIds.has(oldMsg.id)) {
          const isDuplicate = combinedHistory.some(
            (m) => m.content === oldMsg.content && m.sender === oldMsg.sender
          );
          if (!isDuplicate) {
            combinedHistory.push(oldMsg);
          }
        }
      }

      // Sort combined history chronologically
      combinedHistory.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeA - timeB;
      });

      const lastRawMsg = combinedHistory[combinedHistory.length - 1];
      const lastMsgText = lastRawMsg?.content || rawConv.snippet || 'Mensaje de Messenger';
      const lastMsgDate = rawConv.updated_time ? new Date(rawConv.updated_time) : new Date();
      const lastActivityFormatted = lastMsgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const leadRecord: Lead = {
        id: leadId,
        name: customerName,
        roleCompany: 'Cliente Potencial - Facebook Messenger',
        dealCode: `FB-${customerPsid.slice(-6)}`,
        manager: 'Carlos Mendoza (Asesor)',
        email: customer.email || `${customerPsid}@facebook.com`,
        handleOrPhone: `ID: ${customerPsid}`,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(customerName)}&background=1877F2&color=ffffff&bold=true&size=256`,
        channel: 'messenger',
        pageName: pageName,
        socialAccountName: `Página Facebook: ${pageName}`,
        externalUserId: customerPsid,
        status: existing?.status || 'new_lead',
        urgency: existing?.urgency || 'hot',
        intentScore: existing?.intentScore || 85,
        estimatedValue: existing?.estimatedValue || 250,
        tags: ['Facebook Messenger', pageName, 'Inbound'],
        lastMessage: lastMsgText,
        lastActivity: lastActivityFormatted,
        unreadCount: rawConv.unread_count || 0,
        notes: existing?.notes || `Prospecto contactado vía Messenger de la página ${pageName}.`,
        conversationHistory: combinedHistory,
        activities: existing?.activities || [
          {
            id: `act-${customerPsid}`,
            type: 'chat',
            title: `Conversación activa en Messenger`,
            description: `Interacción con ${customerName} en la página ${pageName}.`,
            date: lastMsgDate.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }),
            manager: 'Asesor Comercial',
            stageBadge: 'Messenger',
          },
        ],
      };

      syncedLeads.push(leadRecord);
    }

    // Preserve any leads that were created locally or not returned in the current batch
    for (const prevLead of existingLeads) {
      if (!syncedLeads.some((l) => l.id === prevLead.id || (prevLead.externalUserId && l.externalUserId === prevLead.externalUserId))) {
        syncedLeads.push(prevLead);
      }
    }

    this.saveLeads(syncedLeads);
    return { success: true, count: syncedLeads.length, totalMessages };
  }

  static async sendMessageToFacebook(customerPsid: string, text: string): Promise<any> {
    const { token, pageId } = this.getCredentials();

    const url = `https://graph.facebook.com/v21.0/${pageId}/messages?access_token=${token}`;
    const payload = {
      recipient: { id: customerPsid },
      message: { text },
      messaging_type: 'RESPONSE',
    };

    const leads = this.loadSavedLeads();
    const lead = leads.find((l) => l.externalUserId === customerPsid || l.id === `lead-${customerPsid}`);
    const now = new Date();
    const localMsgId = `msg-${Date.now()}`;
    const newMsg: Message = {
      id: localMsgId,
      sender: 'agent',
      content: text,
      timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: now.toISOString(),
      type: 'text',
    };

    if (lead) {
      lead.conversationHistory.push(newMsg);
      lead.lastMessage = text;
      lead.lastActivity = newMsg.timestamp;
      this.saveLeads(leads);
    }

    // 2. Dispatch to Facebook Graph API
    let resData: any = null;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      resData = await res.json();
      if (!res.ok) {
        console.error('[FacebookSync] Failed to send message to Facebook:', resData);
        const subcode = resData.error?.error_subcode;
        const code = resData.error?.code;
        const msg = resData.error?.message || '';

        let userFriendlyMsg = msg;
        if (subcode === 2018278 || subcode === 2018001 || msg.includes('fuera del período permitido') || msg.includes('24 hours')) {
          userFriendlyMsg = 'Ventana de 24h cerrada: Han pasado más de 24 horas desde el último mensaje del cliente. Facebook bloquea el envío por API; debes responder directamente desde Meta Business Suite.';
        } else if (code === 190 || subcode === 463 || msg.includes('Session has expired')) {
          userFriendlyMsg = 'Token de acceso a Facebook expirado: Por favor actualiza el token en la configuración.';
        }

        if (lead) {
          newMsg.deliveryStatus = 'failed';
          newMsg.deliveryError = userFriendlyMsg;
          this.saveLeads(leads);
        }
        throw new Error(userFriendlyMsg);
      }

      if (lead) {
        newMsg.deliveryStatus = 'delivered';
        if (resData.message_id) {
          newMsg.id = resData.message_id;
        }
        this.saveLeads(leads);
      }
    } catch (dispatchErr: any) {
      console.warn('[FacebookSync] Dispatch to Facebook error:', dispatchErr?.message || dispatchErr);
      if (lead && newMsg.deliveryStatus !== 'delivered') {
        newMsg.deliveryStatus = 'failed';
        newMsg.deliveryError = dispatchErr?.message || 'Error al despachar a Facebook';
        this.saveLeads(leads);
      }
      throw dispatchErr;
    }

    return resData || { success: true, localId: localMsgId };
  }
}
