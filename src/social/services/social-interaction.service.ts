import { db } from '../../db';
import * as schema from '../../db/schema';
import { eq, and, isNull, desc, inArray, or, ilike } from 'drizzle-orm';
import { NormalizedSocialEvent } from '../../meta/webhooks/meta-webhook.normalizer';
import { SocialTriggerService } from './social-trigger.service';
import { ContactService } from '../../services/contact.service';
import { LeadService } from '../../services/lead.service';
import { ActivityService } from '../../services/activity.service';

export interface ProcessEventResult {
  success: boolean;
  duplicate?: boolean;
  interactionId?: number;
  contactId?: number;
  leadId?: number | null;
  conversationId?: number | null;
  messageId?: number | null;
  isCommercialLead?: boolean;
  matchedKeyword?: string;
  sourceSocialPostId?: number | null;
  reason?: string;
}

export class SocialInteractionService {
  /**
   * Main entry point to process any incoming normalized social event
   */
  static async processEvent(event: NormalizedSocialEvent): Promise<ProcessEventResult> {
    // 1. Resolve Workspace and SocialAccount using the External Page ID
    const [socialAccount] = await db
      .select()
      .from(schema.socialAccounts)
      .where(eq(schema.socialAccounts.externalAccountId, event.externalPageId))
      .limit(1);

    if (!socialAccount) {
      console.warn(
        `[SocialInteractionService] No se encontró cuenta social vinculada para Page ID: ${event.externalPageId}`
      );
      return {
        success: false,
        reason: `Página de Meta con ID ${event.externalPageId} no está registrada en ningún Workspace.`,
      };
    }

    const workspaceId = socialAccount.workspaceId;

    // 2. Idempotency Check: Prevent duplicate processing of the same Meta event
    const [existingInteraction] = await db
      .select()
      .from(schema.socialInteractions)
      .where(
        and(
          eq(schema.socialInteractions.workspaceId, workspaceId),
          eq(schema.socialInteractions.platform, event.platform),
          eq(schema.socialInteractions.externalInteractionId, event.externalInteractionId)
        )
      )
      .limit(1);

    if (existingInteraction) {
      return {
        success: true,
        duplicate: true,
        interactionId: existingInteraction.id,
        contactId: existingInteraction.contactId || undefined,
        leadId: existingInteraction.leadId,
        reason: 'Evento ya procesado previamente (idempotente).',
      };
    }

    // 3. Post Attribution (Associate comment with original CRM SocialPost)
    let sourceSocialPostId: number | null = null;

    if (event.type === 'COMMENT' && event.externalPostId) {
      // Find in socialPostTargets by externalPostId
      const targetMatches = await db
        .select()
        .from(schema.socialPostTargets)
        .where(
          and(
            eq(schema.socialPostTargets.workspaceId, workspaceId),
            eq(schema.socialPostTargets.platform, event.platform)
          )
        );

      const matchedTarget = targetMatches.find((t) => {
        if (!t.externalPostId) return false;
        // Meta post IDs can be '{pageId}_{postId}' or just '{postId}'
        return (
          t.externalPostId === event.externalPostId ||
          event.externalPostId.includes(t.externalPostId) ||
          t.externalPostId.includes(event.externalPostId)
        );
      });

      if (matchedTarget) {
        sourceSocialPostId = matchedTarget.socialPostId;
      }
    }

    // 4. Contact & SocialIdentity Resolution
    let contactId: number;
    let [identity] = await db
      .select()
      .from(schema.socialIdentities)
      .where(
        and(
          eq(schema.socialIdentities.workspaceId, workspaceId),
          eq(schema.socialIdentities.platform, event.platform),
          eq(schema.socialIdentities.externalUserId, event.externalUserId)
        )
      )
      .limit(1);

    if (identity) {
      contactId = identity.contactId;

      // If contact exists and authorName provided, update if current name is generic
      if (event.authorName) {
        const [currContact] = await db
          .select()
          .from(schema.contacts)
          .where(eq(schema.contacts.id, contactId))
          .limit(1);

        if (currContact && currContact.name.startsWith('Usuario Facebook')) {
          await db
            .update(schema.contacts)
            .set({ name: event.authorName, updatedAt: new Date() })
            .where(eq(schema.contacts.id, contactId));
        }
      }
    } else {
      // Create new Contact in CRM
      const authorName =
        event.authorName || `Usuario Facebook (${event.externalUserId.slice(-4)})`;

      const newContact = await ContactService.createContact(workspaceId, {
        name: authorName,
        email: `${event.externalUserId}@facebook.com`,
        phone: '',
        company: 'Interacción en Facebook',
        jobTitle: 'Prospecto Social',
        tags: ['facebook', event.type.toLowerCase(), 'meta-inbound'],
        notes: `Capturado automáticamente por interacción en Facebook Page (${event.type}).`,
        socialIdentities: [
          {
            platform: event.platform,
            externalUserId: event.externalUserId,
            username: event.authorUsername,
          },
        ],
      });

      contactId = newContact.id;

      // Log activity: CONTACT_CREATED_FROM_SOCIAL
      await ActivityService.logActivity(workspaceId, {
        contactId,
        type: 'CONTACT_CREATED',
        title: 'CONTACT_CREATED_FROM_SOCIAL',
        description: `Nuevo contacto creado a partir de interacción en Facebook (${event.type}): "${event.content.substring(0, 60)}"`,
        stageBadge: 'Nuevo Contacto',
      });
    }

    // 5. Keyword Trigger & Lead Intent Evaluation
    const triggerResult = await SocialTriggerService.evaluateTriggers(
      workspaceId,
      sourceSocialPostId || undefined,
      event.content
    );

    let createdOrMatchedLeadId: number | null = null;

    // 6. Lead Creation & Deduplication (Only when commercial keyword/intent matched)
    if (triggerResult.matched) {
      // Check for existing active lead for this contact to avoid duplicates
      const existingActiveLeads = await db
        .select()
        .from(schema.leads)
        .where(
          and(
            eq(schema.leads.workspaceId, workspaceId),
            eq(schema.leads.contactId, contactId),
            isNull(schema.leads.deletedAt),
            inArray(schema.leads.status, ['NEW', 'CONTACTED', 'QUALIFYING', 'QUALIFIED'])
          )
        )
        .orderBy(desc(schema.leads.createdAt));

      if (existingActiveLeads.length > 0) {
        // Reuse existing lead to avoid spam/duplication
        const activeLead = existingActiveLeads[0];
        createdOrMatchedLeadId = activeLead.id;

        // Bump score and log note activity
        await db
          .update(schema.leads)
          .set({
            score: Math.min(activeLead.score + 10, 100),
            updatedAt: new Date(),
          })
          .where(eq(schema.leads.id, activeLead.id));

        await ActivityService.logActivity(workspaceId, {
          contactId,
          leadId: activeLead.id,
          type: 'NOTE_ADDED',
          title: 'LEAD_TRIGGER_MATCHED',
          description: `Interacción repetida con intención comercial detectada ('${triggerResult.matchedKeyword}'): "${event.content}"`,
          stageBadge: 'Interés Reincidente',
        });
      } else {
        // Create new Lead
        const [newLead] = await db
          .insert(schema.leads)
          .values({
            workspaceId,
            contactId,
            source: 'FACEBOOK',
            sourceCampaign: sourceSocialPostId ? `Post #${sourceSocialPostId}` : 'Facebook Inbound',
            sourceSocialPostId: sourceSocialPostId || null,
            sourceSocialAccountId: socialAccount.id,
            productId: triggerResult.productId || null,
            status: 'NEW',
            temperature: 'WARM',
            score: 70,
          })
          .returning();

        createdOrMatchedLeadId = newLead.id;

        // Log Activity: LEAD_CREATED_FROM_SOCIAL
        await ActivityService.logActivity(workspaceId, {
          contactId,
          leadId: newLead.id,
          type: 'LEAD_CREATED',
          title: 'LEAD_CREATED_FROM_SOCIAL',
          description: `Prospecto creado desde comentario con trigger '${triggerResult.matchedKeyword}': "${event.content}"`,
          stageBadge: 'Lead Calificado',
        });

        // Update post analytics if post attached
        if (sourceSocialPostId) {
          try {
            const [analytics] = await db
              .select()
              .from(schema.socialPostAnalytics)
              .where(
                and(
                  eq(schema.socialPostAnalytics.workspaceId, workspaceId),
                  eq(schema.socialPostAnalytics.socialPostId, sourceSocialPostId)
                )
              )
              .limit(1);

            if (analytics) {
              await db
                .update(schema.socialPostAnalytics)
                .set({
                  leadsGenerated: (analytics.leadsGenerated || 0) + 1,
                  comments: (analytics.comments || 0) + 1,
                  updatedAt: new Date(),
                })
                .where(eq(schema.socialPostAnalytics.id, analytics.id));
            }
          } catch {
            // Non-blocking analytics update
          }
        }
      }
    }

    // 7. Messenger Inbound Conversation & Message Persistence
    let conversationId: number | null = null;
    let messageId: number | null = null;

    if (event.type === 'DIRECT_MESSAGE') {
      let [conv] = await db
        .select()
        .from(schema.conversations)
        .where(
          and(
            eq(schema.conversations.workspaceId, workspaceId),
            eq(schema.conversations.contactId, contactId),
            eq(schema.conversations.channel, 'MESSENGER')
          )
        )
        .limit(1);

      if (!conv) {
        [conv] = await db
          .insert(schema.conversations)
          .values({
            workspaceId,
            contactId,
            channel: 'MESSENGER',
            externalConversationId: `meta_${event.externalUserId}`,
            status: 'OPEN',
            lastMessage: event.content,
            lastMessageAt: event.occurredAt,
            unreadCount: 1,
          })
          .returning();
      } else {
        await db
          .update(schema.conversations)
          .set({
            lastMessage: event.content,
            lastMessageAt: event.occurredAt,
            unreadCount: conv.unreadCount + 1,
            status: 'OPEN',
            updatedAt: new Date(),
          })
          .where(eq(schema.conversations.id, conv.id));
      }

      conversationId = conv.id;

      // Insert Inbound Message
      const messageDate = event.occurredAt || new Date();
      const [savedMessage] = await db
        .insert(schema.messages)
        .values({
          workspaceId,
          conversationId: conv.id,
          direction: 'INBOUND',
          sender: 'customer',
          type: 'TEXT',
          content: event.content,
          externalMessageId: event.externalInteractionId,
          sentAt: messageDate,
          deliveredAt: new Date(),
          createdAt: messageDate,
          timestampStr: messageDate.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
        })
        .returning();

      messageId = savedMessage.id;

      // Log Activity: MESSAGE_RECEIVED
      await ActivityService.logActivity(workspaceId, {
        contactId,
        conversationId: conv.id,
        type: 'MESSAGE_RECEIVED',
        title: 'MESSAGE_RECEIVED',
        description: `Mensaje de Messenger recibido: "${event.content.substring(0, 80)}"`,
        stageBadge: 'Messenger Inbound',
      });
    }

    // 8. Persist SocialInteraction Record
    const processingStatus = triggerResult.matched
      ? 'PROCESSED'
      : event.type === 'DIRECT_MESSAGE'
      ? 'PROCESSED'
      : 'IGNORED';

    const [interaction] = await db
      .insert(schema.socialInteractions)
      .values({
        workspaceId,
        socialAccountId: socialAccount.id,
        socialPostId: sourceSocialPostId,
        externalInteractionId: event.externalInteractionId,
        platform: event.platform,
        type: event.type,
        externalUserId: event.externalUserId,
        authorName: event.authorName || null,
        authorUsername: event.authorUsername || null,
        content: event.content,
        parentExternalId: event.parentExternalId || null,
        processingStatus,
        contactId,
        leadId: createdOrMatchedLeadId,
        occurredAt: event.occurredAt,
        processedAt: new Date(),
        metadata: {
          matchedKeyword: triggerResult.matchedKeyword || null,
          triggerId: triggerResult.triggerId || null,
          isCommercialIntent: triggerResult.matched,
          rawItem: event.rawPayload?.item || event.type,
        },
      })
      .returning();

    // Log Activity: SOCIAL_INTERACTION_RECEIVED
    await ActivityService.logActivity(workspaceId, {
      contactId,
      leadId: createdOrMatchedLeadId || undefined,
      type: 'NOTE_ADDED',
      title: 'SOCIAL_INTERACTION_RECEIVED',
      description: `Interacción recibida en Facebook (${event.type}): "${event.content.substring(0, 60)}" [Estado: ${processingStatus}]`,
      stageBadge: 'Interacción Social',
    });

    return {
      success: true,
      interactionId: interaction.id,
      contactId,
      leadId: createdOrMatchedLeadId,
      conversationId,
      messageId,
      isCommercialLead: triggerResult.matched,
      matchedKeyword: triggerResult.matchedKeyword,
      sourceSocialPostId,
    };
  }

  /**
   * Query interactions for UI reporting
   */
  static async getInteractions(
    workspaceId: number,
    options?: {
      platform?: string;
      type?: string;
      processingStatus?: string;
      socialPostId?: number;
      search?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    const conditions = [eq(schema.socialInteractions.workspaceId, workspaceId)];

    if (options?.platform) {
      conditions.push(eq(schema.socialInteractions.platform, options.platform));
    }
    if (options?.type) {
      conditions.push(eq(schema.socialInteractions.type, options.type));
    }
    if (options?.processingStatus) {
      conditions.push(eq(schema.socialInteractions.processingStatus, options.processingStatus));
    }
    if (options?.socialPostId) {
      conditions.push(eq(schema.socialInteractions.socialPostId, options.socialPostId));
    }
    if (options?.search) {
      const s = `%${options.search}%`;
      conditions.push(
        or(
          ilike(schema.socialInteractions.content, s),
          ilike(schema.socialInteractions.authorName, s)
        ) as any
      );
    }

    const items = await db
      .select({
        interaction: schema.socialInteractions,
        contact: schema.contacts,
        lead: schema.leads,
        post: schema.socialPosts,
      })
      .from(schema.socialInteractions)
      .leftJoin(schema.contacts, eq(schema.socialInteractions.contactId, schema.contacts.id))
      .leftJoin(schema.leads, eq(schema.socialInteractions.leadId, schema.leads.id))
      .leftJoin(schema.socialPosts, eq(schema.socialInteractions.socialPostId, schema.socialPosts.id))
      .where(and(...conditions))
      .orderBy(desc(schema.socialInteractions.occurredAt))
      .limit(options?.limit || 50)
      .offset(options?.offset || 0);

    return items.map((row) => ({
      ...row.interaction,
      contact: row.contact,
      lead: row.lead,
      post: row.post,
    }));
  }
}
