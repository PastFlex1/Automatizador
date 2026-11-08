import { db } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import { eq, and, desc } from 'drizzle-orm';
import { SocialAccountService } from '../social/services/social-account.service.ts';
import { ContactService } from './contact.service.ts';
import { LeadService } from './lead.service.ts';
import { DealService } from './deal.service.ts';
import { ConversationService } from './conversation.service.ts';
import { ActivityService } from './activity.service.ts';

export class MetaMessengerService {
  /**
   * Sync real Facebook Messenger & Instagram conversations from Meta Graph API into CRM DB
   */
  static async syncConversations(workspaceId: number = 1) {
    // 1. Get all connected Meta accounts for this workspace
    const rawAccounts = await db
      .select()
      .from(schema.socialAccounts)
      .where(
        and(
          eq(schema.socialAccounts.workspaceId, workspaceId),
          eq(schema.socialAccounts.status, 'CONNECTED')
        )
      );

    if (rawAccounts.length === 0) {
      return { success: false, message: 'No hay cuentas de Meta conectadas en este workspace.', syncedCount: 0 };
    }

    let totalSyncedConversations = 0;
    let totalSyncedMessages = 0;

    for (const acc of rawAccounts) {
      const internalAcc = await SocialAccountService.getAccountInternal(workspaceId, acc.id);
      if (!internalAcc || !internalAcc.accessToken) continue;

      const pageId = internalAcc.externalAccountId;
      const token = internalAcc.accessToken;

      // Skip demo/mock accounts that aren't valid Meta IDs or use mock tokens
      if (!pageId || !/^\d+$/.test(pageId) || token.startsWith('mock_')) {
        continue;
      }

      try {
        // Fetch conversations with messages and senders (using safe 25 batch size)
        const url = `https://graph.facebook.com/v21.0/${pageId}/conversations?fields=id,snippet,updated_time,unread_count,senders,messages.limit(25){id,message,created_time,from}&limit=25&access_token=${token}`;
        const res = await fetch(url);
        if (!res.ok) {
          const errData: any = await res.json().catch(() => ({}));
          const errMsg = errData.error?.message || res.statusText || '';
          const isExpired =
            errData.error?.code === 190 ||
            errMsg.toLowerCase().includes('expired') ||
            errMsg.toLowerCase().includes('session has expired');

          if (isExpired) {
            console.warn(`[Meta Sync] Token expirado para la cuenta #${acc.id} (${acc.name}). Marcando como EXPIRED.`);
            await SocialAccountService.updateAccountStatus(workspaceId, acc.id, 'EXPIRED').catch(() => {});
          } else {
            console.warn(`Meta Graph API warning for account #${acc.id} (${acc.name}):`, errMsg);
          }
          continue;
        }

        const data = await res.json();
        const metaConversations = data.data || [];

        for (const metaConv of metaConversations) {
          if (!metaConv.senders?.data || metaConv.senders.data.length === 0) continue;

          // Find the customer sender (participant who is NOT the Page itself)
          const customerSender = metaConv.senders.data.find((s: any) => s.id !== pageId) || metaConv.senders.data[0];
          if (!customerSender) continue;

          const customerName = customerSender.name || `Prospecto Meta (${customerSender.id.slice(-4)})`;
          const customerPsid = customerSender.id;
          const externalThreadId = metaConv.id;

          // 1. Check if social identity exists for this PSID
          let [identity] = await db
            .select()
            .from(schema.socialIdentities)
            .where(
              and(
                eq(schema.socialIdentities.workspaceId, workspaceId),
                eq(schema.socialIdentities.platform, internalAcc.platform === 'INSTAGRAM' ? 'INSTAGRAM' : 'MESSENGER'),
                eq(schema.socialIdentities.externalUserId, customerPsid)
              )
            )
            .limit(1);

          let contactId: number;

          if (identity) {
            contactId = identity.contactId;
            // Update contact name if previously generic
            await db
              .update(schema.contacts)
              .set({ name: customerName, updatedAt: new Date() })
              .where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.workspaceId, workspaceId)));
          } else {
            // Create contact in CRM
            const contact = await ContactService.createContact(workspaceId, {
              name: customerName,
              email: customerSender.email || `${customerPsid}@facebook.com`,
              phone: '',
              company: 'Facebook Lead',
              jobTitle: 'Cliente Potencial',
              tags: ['Meta Messenger', 'Inbound', internalAcc.name],
              notes: `Prospecto ingresado vía Messenger de la página ${internalAcc.name} (ID: ${pageId})`,
            });
            contactId = contact.id;

            // Create social identity
            [identity] = await db
              .insert(schema.socialIdentities)
              .values({
                workspaceId,
                contactId,
                platform: internalAcc.platform === 'INSTAGRAM' ? 'INSTAGRAM' : 'MESSENGER',
                externalUserId: customerPsid,
                username: customerSender.email || customerPsid,
                metadata: {
                  pageId,
                  senderName: customerName,
                  sourceAccountName: internalAcc.name,
                },
              })
              .returning();

            // Create Lead record
            await LeadService.createLead(workspaceId, {
              contactId,
              status: 'NEW',
              temperature: 'HOT',
              score: 85,
              source: `Meta Messenger (${internalAcc.name})`,
              detectedObjection: 'Interés inicial en producto',
            });

            // Create Deal record
            await DealService.createDeal(workspaceId, {
              contactId,
              title: `Oportunidad Messenger: ${customerName}`,
              value: 180.00,
              stageKey: 'NEW_LEAD',
              probability: 60,
              currency: 'USD',
            });
          }

          // 2. Find or create Conversation in DB
          let [conv] = await db
            .select()
            .from(schema.conversations)
            .where(
              and(
                eq(schema.conversations.workspaceId, workspaceId),
                eq(schema.conversations.contactId, contactId)
              )
            )
            .limit(1);

          if (!conv) {
            conv = await ConversationService.createConversation(workspaceId, {
              contactId,
              channel: internalAcc.platform === 'INSTAGRAM' ? 'INSTAGRAM' : 'MESSENGER',
              status: 'ACTIVE',
            });
          }
 else {
            // Update lastMessage and unread count
            await db
              .update(schema.conversations)
              .set({
                lastMessage: metaConv.snippet || conv.lastMessage,
                unreadCount: metaConv.unread_count || 0,
                updatedAt: new Date(),
              })
              .where(eq(schema.conversations.id, conv.id));
          }

          // 3. Process messages (ordered chronologically)
          const rawMsgs = metaConv.messages?.data || [];
          // Meta returns newest first, reverse for chronological order
          const sortedMsgs = [...rawMsgs].reverse();

          for (const m of sortedMsgs) {
            if (!m.message) continue;

            const isFromPage = m.from?.id === pageId;
            const senderRole = isFromPage ? 'agent' : 'lead';
            const msgDate = m.created_time ? new Date(m.created_time) : new Date();
            const timeStr = msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Check if message already exists in DB to prevent duplicates
            const existing = await db
              .select()
              .from(schema.messages)
              .where(
                and(
                  eq(schema.messages.conversationId, conv.id),
                  eq(schema.messages.content, m.message)
                )
              )
              .limit(1);

            if (existing.length === 0) {
              await db.insert(schema.messages).values({
                workspaceId,
                conversationId: conv.id,
                sender: senderRole,
                content: m.message,
                type: 'TEXT',
                timestampStr: timeStr,
                createdAt: msgDate,
                metaData: {
                  externalMsgId: m.id,
                  fromName: m.from?.name,
                  fromId: m.from?.id,
                },
              });
              totalSyncedMessages++;
            }
          }

          totalSyncedConversations++;
        }
      } catch (err: any) {
        console.error(`Exception during conversation sync for account ${acc.id}:`, err);
      }
    }

    return {
      success: true,
      message: `Sincronización exitosa: ${totalSyncedConversations} conversaciones procesadas y ${totalSyncedMessages} mensajes actualizados desde Meta Messenger.`,
      syncedConversations: totalSyncedConversations,
      syncedMessages: totalSyncedMessages,
    };
  }

  /**
   * Send a message to a real Meta Messenger recipient via Meta Graph API
   */
  static async sendMessage(workspaceId: number, contactId: number, text: string) {
    // 1. Find social identity or recipient PSID
    const [identity] = await db
      .select()
      .from(schema.socialIdentities)
      .where(
        and(
          eq(schema.socialIdentities.workspaceId, workspaceId),
          eq(schema.socialIdentities.contactId, contactId)
        )
      )
      .limit(1);

    if (!identity || !identity.externalUserId) {
      throw new Error('No se encontró el identificador de Messenger (PSID) para este contacto.');
    }

    const recipientPsid = identity.externalUserId;

    // 2. Find connected Meta account
    const rawAccounts = await db
      .select()
      .from(schema.socialAccounts)
      .where(
        and(
          eq(schema.socialAccounts.workspaceId, workspaceId),
          eq(schema.socialAccounts.status, 'CONNECTED')
        )
      );

    const targetAccount = rawAccounts[0];
    if (!targetAccount) {
      throw new Error('No hay ninguna cuenta de Facebook conectada para enviar mensajes.');
    }

    const internalAcc = await SocialAccountService.getAccountInternal(workspaceId, targetAccount.id);
    if (!internalAcc || !internalAcc.accessToken) {
      throw new Error('No se pudo recuperar el token de acceso para la cuenta de Facebook.');
    }

    const pageId = internalAcc.externalAccountId;
    const token = internalAcc.accessToken;

    // 3. Send via Meta Graph API POST /v21.0/me/messages
    const sendUrl = `https://graph.facebook.com/v21.0/${pageId}/messages?access_token=${token}`;
    const payload = {
      recipient: { id: recipientPsid },
      message: { text },
      messaging_type: 'RESPONSE',
    };

    const res = await fetch(sendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const resData = await res.json();
    if (!res.ok) {
      console.error('Meta Graph API message send error:', resData);
      throw new Error(resData.error?.message || 'Error al enviar mensaje a través de Meta Graph API');
    }

    // 4. Save in DB conversation
    let [conv] = await db
      .select()
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.workspaceId, workspaceId),
          eq(schema.conversations.contactId, contactId)
        )
      )
      .limit(1);

    if (conv) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      await db.insert(schema.messages).values({
        workspaceId,
        conversationId: conv.id,
        sender: 'agent',
        content: text,
        type: 'TEXT',
        timestampStr: timeStr,
        createdAt: now,
        metaData: {
          externalMsgId: resData.message_id,
          recipientId: resData.recipient_id,
        },
      });

      await db
        .update(schema.conversations)
        .set({
          lastMessage: text,
          updatedAt: now,
        })
        .where(eq(schema.conversations.id, conv.id));

      await ActivityService.logActivity(workspaceId, {
        contactId,
        type: 'NOTE',
        title: 'MESSENGER_MESSAGE_SENT',
        description: `Mensaje enviado a través de Facebook Messenger: "${text.slice(0, 50)}..."`,
        manager: 'Agente CRM',
        stageBadge: 'Messenger',
      });
    }

    return {
      success: true,
      messageId: resData.message_id,
      recipientId: resData.recipient_id,
    };
  }
}
