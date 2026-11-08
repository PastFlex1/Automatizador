import { Router, Request, Response } from 'express';
import { MetaSignatureValidator } from '../meta/webhooks/meta-signature.validator';
import { MetaWebhookNormalizer } from '../meta/webhooks/meta-webhook.normalizer';
import { SocialInteractionService } from '../social/services/social-interaction.service';
import { automationsEnabled } from '../config/paths.ts';

export const webhookRouter = Router();

/**
 * GET /api/webhooks/meta
 * Webhook Verification Handshake for Meta (Facebook & Instagram)
 */
webhookRouter.get('/meta', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (!mode || !token) {
    return res.status(400).json({ error: 'Missing hub.mode or hub.verify_token' });
  }

  if (mode === 'subscribe' && expectedToken && token === expectedToken) {
    // Meta requires challenge to be returned as plain text with 200 OK
    return res.status(200).send(String(challenge));
  }

  // If META_WEBHOOK_VERIFY_TOKEN is not configured yet in non-prod environment, provide fallback or reject
  if (mode === 'subscribe' && !expectedToken && process.env.NODE_ENV !== 'production') {
    return res.status(200).send(String(challenge));
  }

  console.warn('[Webhook GET /meta] Verification token mismatch');
  return res.status(403).json({ error: 'Verification failed. Token mismatch or invalid mode.' });
});

/**
 * POST /api/webhooks/meta
 * Real-time event receiver for Meta Webhooks (Feed Comments, Messenger messages)
 */
webhookRouter.post('/meta', async (req: Request, res: Response) => {
  const signatureHeader = req.headers['x-hub-signature-256'] as string | undefined;
  const rawBody = (req as any).rawBody || JSON.stringify(req.body);

  // 1. Signature Verification
  const signatureResult = MetaSignatureValidator.validateSignature(
    rawBody,
    signatureHeader,
    process.env.META_APP_SECRET
  );

  if (!signatureResult.valid) {
    console.warn(`[Webhook POST /meta] Signature rejected: ${signatureResult.reason}`);
    return res.status(401).json({
      success: false,
      error: 'Invalid signature',
      reason: signatureResult.reason,
    });
  }

  // 2. Fast acknowledge to Meta (Meta expects 200 within a few seconds)
  const normalizedEvents = MetaWebhookNormalizer.normalizePayload(req.body);

  res.status(200).json({
    success: true,
    status: 'EVENT_RECEIVED',
    eventsCount: normalizedEvents.length,
  });

  // 3. Process normalized events asynchronously through CRM pipeline
  for (const event of normalizedEvents) {
    try {
      const result = await SocialInteractionService.processEvent(event);
      console.log(
        `[Webhook POST /meta] Processed ${event.type} from ${event.externalUserId}:`,
        result
      );
    } catch (err: any) {
      console.warn(
        `[Webhook POST /meta] Database processing skipped, saving to local CRM state:`,
        err?.message || err
      );
    }

    // Always ensure it's saved in local storage for real-time inbox
    try {
      const { FacebookSyncService } = await import('../services/facebook-sync.service.ts');
      const leads = FacebookSyncService.loadSavedLeads();
      let lead = leads.find((l) => l.externalUserId === event.externalUserId || l.id === `lead-${event.externalUserId}`);
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const uid = event.externalUserId;
      const profiles = {
        WHATSAPP: {
          channel: 'whatsapp' as const, label: 'WhatsApp', code: 'WA', color: '25D366',
          name: `WhatsApp ${uid}`, role: 'Cliente WhatsApp Business', email: `${uid}@whatsapp.com`,
          handle: event.authorUsername || `+${uid}`, account: 'WhatsApp Cloud API: APM inox',
        },
        INSTAGRAM: {
          channel: 'instagram' as const, label: 'Instagram', code: 'IG', color: 'E1306C',
          name: `Instagram (${uid.slice(-4)})`, role: 'Cliente Potencial - Instagram Direct', email: `${uid}@instagram.com`,
          handle: `ID: ${uid}`, account: 'Instagram de APM inox 1',
        },
        FACEBOOK: {
          channel: 'messenger' as const, label: 'Messenger', code: 'FB', color: '1877F2',
          name: `Cliente (${uid.slice(-4)})`, role: 'Cliente Potencial - Facebook Messenger', email: `${uid}@facebook.com`,
          handle: `ID: ${uid}`, account: 'Página Facebook: APM inox 1',
        },
      };
      const profile = profiles[event.platform as keyof typeof profiles] || profiles.FACEBOOK;

      if (!lead) {
        lead = {
          id: `lead-${uid}`,
          name: event.authorName || profile.name,
          roleCompany: profile.role,
          dealCode: `${profile.code}-${uid.slice(-6)}`,
          manager: 'Asesor Comercial',
          email: profile.email,
          handleOrPhone: profile.handle,
          avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(event.authorName || profile.label)}&background=${profile.color}&color=ffffff&bold=true&size=256`,
          channel: profile.channel,
          pageName: 'APM inox 1',
          socialAccountName: profile.account,
          externalUserId: uid,
          status: 'new_lead',
          urgency: 'hot',
          intentScore: 85,
          estimatedValue: 200,
          tags: [profile.label, 'APM inox 1', 'Inbound'],
          lastMessage: event.content,
          lastActivity: timeStr,
          unreadCount: 1,
          notes: `Mensaje recibido en tiempo real vía ${profile.label} Webhook.`,
          conversationHistory: [],
        };
        leads.unshift(lead);
      } else if (event.platform === 'WHATSAPP') {
        // The customer wrote to the business number: this chat is now an official API chat.
        lead.socialAccountName = profile.account;
      } else if (event.platform === 'INSTAGRAM') {
        lead.channel = 'instagram';
      }

      // Meta retries webhooks that were slow to acknowledge: never store/answer a message twice.
      const alreadyStored = !!event.externalInteractionId &&
        (lead.conversationHistory || []).some((m) => m.id === event.externalInteractionId);
      if (alreadyStored) {
        console.log(`[Webhook] Duplicate delivery of ${event.externalInteractionId} ignored.`);
        continue;
      }

      if (event.platform === 'WHATSAPP' && event.externalInteractionId && automationsEnabled()) {
        import('../services/whatsapp-sync.service.ts')
          .then(({ WhatsAppSyncService }) => WhatsAppSyncService.markAsRead(event.externalInteractionId))
          .catch(() => {});
      }

      lead.conversationHistory = lead.conversationHistory || [];
      lead.conversationHistory.push({
        id: event.externalInteractionId || `msg-${Date.now()}`,
        sender: 'customer',
        content: event.content,
        timestamp: timeStr,
        createdAt: now.toISOString(),
        type: 'text',
      });
      lead.lastMessage = event.content;
      lead.lastActivity = timeStr;
      FacebookSyncService.saveLeads(leads);
      console.log(`[Webhook] Real-time message registered for ${lead.name}: "${event.content}"`);

      // Automatic AI Responder for incoming Facebook Messenger messages
      if (lead && (event.type as any) === 'DIRECT_MESSAGE' && event.content && event.externalUserId) {
        import('../services/facebook-auto-responder.service.ts')
          .then(({ FacebookAutoResponderService }) => {
            FacebookAutoResponderService.handleIncomingMessage({
              lead,
              customerPsid: event.externalUserId,
              messageText: event.content,
              messageId: event.externalInteractionId,
            }).catch((err) => console.error('[Webhook] AutoResponder execution error:', err));
          })
          .catch((importErr) => console.warn('[Webhook] Could not load AutoResponder:', importErr));
      }
    } catch (localSaveErr) {
      console.error('[Webhook] Error saving local event:', localSaveErr);
    }
  }
});
