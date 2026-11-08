import { db } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import { eq, and, desc, asc } from 'drizzle-orm';
import { ActivityService } from './activity.service.ts';

export interface CreateMessageDto {
  sender: string; // 'customer' | 'agent' | 'ai_autopilot'
  direction?: 'INBOUND' | 'OUTBOUND';
  type?: 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT' | 'product_card' | 'payment_link';
  content: string;
  externalMessageId?: string;
  metaData?: any;
  timestampStr?: string;
}

export class ConversationService {
  static async getConversations(
    workspaceId: number,
    options?: { channel?: string; status?: string; contactId?: number; limit?: number }
  ) {
    const conditions = [eq(schema.conversations.workspaceId, workspaceId)];

    if (options?.channel) {
      conditions.push(eq(schema.conversations.channel, options.channel.toUpperCase()));
    }
    if (options?.status) {
      conditions.push(eq(schema.conversations.status, options.status.toUpperCase()));
    }
    if (options?.contactId) {
      conditions.push(eq(schema.conversations.contactId, options.contactId));
    }

    const conversationsList = await db
      .select()
      .from(schema.conversations)
      .where(and(...conditions.filter(Boolean) as any))
      .orderBy(desc(schema.conversations.lastMessageAt))
      .limit(options?.limit || 50);

    return conversationsList;
  }

  static async getConversationById(workspaceId: number, conversationId: number) {
    const list = await db
      .select()
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.workspaceId, workspaceId),
          eq(schema.conversations.id, conversationId)
        )
      )
      .limit(1);

    return list[0] || null;
  }

  static async getMessagesByConversationId(workspaceId: number, conversationId: number) {
    const messagesList = await db
      .select()
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.workspaceId, workspaceId),
          eq(schema.messages.conversationId, conversationId)
        )
      )
      .orderBy(asc(schema.messages.createdAt));

    return messagesList;
  }

  static async addMessage(workspaceId: number, conversationId: number, dto: CreateMessageDto) {
    const conv = await this.getConversationById(workspaceId, conversationId);
    if (!conv) throw new Error('Conversation not found');

    const direction = dto.direction || (dto.sender === 'customer' ? 'INBOUND' : 'OUTBOUND');
    const timestampStr =
      dto.timestampStr ||
      new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });

    const [msg] = await db
      .insert(schema.messages)
      .values({
        workspaceId,
        conversationId,
        sender: dto.sender,
        direction,
        type: dto.type || 'TEXT',
        content: dto.content,
        externalMessageId: dto.externalMessageId || null,
        metaData: dto.metaData || {},
        sentAt: new Date(),
        deliveredAt: new Date(),
        timestampStr,
      })
      .returning();

    // Update lastMessage on conversation
    await db
      .update(schema.conversations)
      .set({
        lastMessage: dto.content,
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.conversations.workspaceId, workspaceId),
          eq(schema.conversations.id, conversationId)
        )
      );

    // Log Activity
    await ActivityService.logActivity(workspaceId, {
      contactId: conv.contactId,
      conversationId: conv.id,
      type: direction === 'INBOUND' ? 'MESSAGE_RECEIVED' : 'MESSAGE_SENT',
      title: `${direction === 'INBOUND' ? 'Mensaje entrante' : 'Mensaje enviado'} (${conv.channel})`,
      description: dto.content.length > 80 ? dto.content.substring(0, 80) + '...' : dto.content,
      stageBadge: conv.channel,
    });

    return msg;
  }

  static async createConversation(
    workspaceId: number,
    dto: { contactId: number; channel?: string; status?: string }
  ) {
    const [conv] = await db
      .insert(schema.conversations)
      .values({
        workspaceId,
        contactId: dto.contactId,
        channel: (dto.channel || 'WHATSAPP').toUpperCase(),
        status: (dto.status || 'OPEN').toUpperCase(),
        lastMessage: 'Conversación iniciada',
        lastMessageAt: new Date(),
      })
      .returning();

    return conv;
  }
}
