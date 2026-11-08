import { db } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import { eq, and, desc } from 'drizzle-orm';

export interface CreateActivityDto {
  contactId?: number;
  leadId?: number;
  dealId?: number;
  conversationId?: number;
  userId?: number;
  type: string; // 'CONTACT_CREATED' | 'LEAD_CREATED' | 'DEAL_CREATED' | 'STAGE_CHANGED' | 'MESSAGE_RECEIVED' | 'MESSAGE_SENT' | 'NOTE_ADDED' | 'DEAL_WON' | 'DEAL_LOST'
  title: string;
  description?: string;
  stageBadge?: string;
  manager?: string;
  metadata?: any;
  date?: string;
}

export class ActivityService {
  static async logActivity(workspaceId: number, dto: CreateActivityDto) {
    const [act] = await db
      .insert(schema.activities)
      .values({
        workspaceId,
        contactId: dto.contactId,
        leadId: dto.leadId,
        dealId: dto.dealId,
        conversationId: dto.conversationId,
        userId: dto.userId,
        type: dto.type,
        title: dto.title,
        description: dto.description || '',
        stageBadge: dto.stageBadge || 'Historial',
        manager: dto.manager || 'Asesor CRM',
        metadata: dto.metadata || {},
        date: dto.date || new Date().toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }),
      })
      .returning();
    return act;
  }

  static async getActivities(
    workspaceId: number,
    filters?: { contactId?: number; dealId?: number; leadId?: number; limit?: number }
  ) {
    let query = db
      .select()
      .from(schema.activities)
      .where(
        and(
          eq(schema.activities.workspaceId, workspaceId),
          filters?.contactId ? eq(schema.activities.contactId, filters.contactId) : undefined,
          filters?.dealId ? eq(schema.activities.dealId, filters.dealId) : undefined,
          filters?.leadId ? eq(schema.activities.leadId, filters.leadId) : undefined
        )
      )
      .orderBy(desc(schema.activities.createdAt))
      .limit(filters?.limit || 50);

    return await query;
  }
}
