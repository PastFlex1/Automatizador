export type NormalizedSocialPlatform = 'FACEBOOK' | 'INSTAGRAM' | 'THREADS' | 'WHATSAPP';
export type NormalizedInteractionType = 'COMMENT' | 'DIRECT_MESSAGE' | 'MENTION';

export interface NormalizedSocialEvent {
  platform: NormalizedSocialPlatform;
  type: NormalizedInteractionType;
  externalPageId: string;
  externalInteractionId: string;
  externalUserId: string;
  authorName?: string;
  authorUsername?: string;
  externalPostId?: string;
  parentExternalId?: string;
  content: string;
  occurredAt: Date;
  rawPayload: any;
}

export class MetaWebhookNormalizer {
  /**
   * Parse and normalize raw Meta Webhook payload into decoupled internal events.
   * Strips Meta-specific quirks and provides a consistent interface for the CRM.
   */
  static normalizePayload(payload: any): NormalizedSocialEvent[] {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const events: NormalizedSocialEvent[] = [];
    const objectType = payload.object; // 'page' | 'instagram' | 'threads'

    const entries = Array.isArray(payload.entry) ? payload.entry : [];

    for (const entry of entries) {
      const pageId = String(entry.id || entry.page_id || '');

      // 1. Messenger Inbound Messages: entry.messaging[]
      if (Array.isArray(entry.messaging)) {
        for (const msgItem of entry.messaging) {
          // Ignore echo messages (sent by the page itself to user) or delivery confirmations
          if (msgItem.message?.is_echo || msgItem.delivery || msgItem.read) {
            continue;
          }

          const senderId = String(msgItem.sender?.id || '');
          const recipientId = String(msgItem.recipient?.id || pageId);

          // Skip if sender is the page itself
          if (senderId === pageId || !senderId) {
            continue;
          }

          const messageId = msgItem.message?.mid || `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          const textContent = msgItem.message?.text || (msgItem.message?.attachments?.length ? '[Adjunto multimedia]' : '');
          const timestampMs = typeof msgItem.timestamp === 'number' ? msgItem.timestamp : Date.now();

          events.push({
            // Instagram Direct arrives with the same "messaging" shape, under object "instagram"
            platform: objectType === 'instagram' ? 'INSTAGRAM' : 'FACEBOOK',
            type: 'DIRECT_MESSAGE',
            externalPageId: recipientId || pageId,
            externalInteractionId: messageId,
            externalUserId: senderId,
            authorName: msgItem.sender?.name,
            content: textContent,
            occurredAt: new Date(timestampMs),
            rawPayload: msgItem,
          });
        }
      }

      // 2. Facebook Page Feed Events (Comments / Wall Posts): entry.changes[]
      if (Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          const field = change.field;
          const value = change.value;

          if (!value || typeof value !== 'object') continue;

          // Feed comment or post
          if (field === 'feed') {
            const item = value.item; // 'comment' | 'post' | 'status' | 'reaction'
            const verb = value.verb; // 'add' | 'edit' | 'remove'

            // We only capture newly added comments
            if (item === 'comment' && verb === 'add') {
              const commentId = String(value.comment_id || '');
              const postId = String(value.post_id || '');
              const parentId = String(value.parent_id || postId || '');
              const fromUser = value.from || {};
              const senderId = String(fromUser.id || '');
              const senderName = fromUser.name || '';

              // Skip if comment is made by the page itself
              if (senderId === pageId || !commentId) {
                continue;
              }

              const message = String(value.message || '').trim();
              const createdTime = value.created_time
                ? new Date(typeof value.created_time === 'number' ? value.created_time * 1000 : value.created_time)
                : new Date();

              events.push({
                platform: 'FACEBOOK',
                type: 'COMMENT',
                externalPageId: pageId,
                externalInteractionId: commentId,
                externalUserId: senderId,
                authorName: senderName || undefined,
                externalPostId: postId || undefined,
                parentExternalId: parentId || undefined,
                content: message,
                occurredAt: createdTime,
                rawPayload: change,
              });
            }
          }

          // 3. WhatsApp Cloud API Inbound Messages
          if (field === 'messages' && Array.isArray(value.messages)) {
              const phoneNumberId = String(value.metadata?.phone_number_id || pageId);
              const contacts = Array.isArray(value.contacts) ? value.contacts : [];
              const contactMap = new Map<string, string>();
              for (const c of contacts) {
                if (c.wa_id && c.profile?.name) {
                  contactMap.set(String(c.wa_id), c.profile.name);
                }
              }

              for (const msg of value.messages) {
                const fromNumber = String(msg.from || '');
                const messageId = String(msg.id || `wa_${Date.now()}`);
                const authorName = contactMap.get(fromNumber) || `+${fromNumber}`;
                let content = '';

                if (msg.type === 'text' && msg.text?.body) {
                  content = msg.text.body;
                } else if (msg.type === 'button' && msg.button?.text) {
                  content = msg.button.text;
                } else if (msg.type === 'interactive') {
                  content = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '[Interacción WhatsApp]';
                } else if (msg.type === 'image') {
                  content = msg.image?.caption || '[Foto enviada por WhatsApp]';
                } else if (msg.type === 'audio') {
                  content = '[Nota de voz WhatsApp]';
                } else {
                  content = `[Mensaje ${msg.type || 'WhatsApp'}]`;
                }

                const timestampMs = typeof msg.timestamp === 'string'
                  ? parseInt(msg.timestamp, 10) * 1000
                  : typeof msg.timestamp === 'number'
                  ? msg.timestamp * 1000
                  : Date.now();

                events.push({
                  platform: 'WHATSAPP',
                  type: 'DIRECT_MESSAGE',
                  externalPageId: phoneNumberId,
                  externalInteractionId: messageId,
                  externalUserId: fromNumber,
                  authorName,
                  authorUsername: `+${fromNumber}`,
                  content,
                  occurredAt: new Date(timestampMs),
                  rawPayload: msg,
                });
              }
            }
          }
        }
      }

    return events;
  }
}
