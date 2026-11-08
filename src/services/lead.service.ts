import { db } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { ActivityService } from './activity.service.ts';

export interface CreateLeadDto {
  contactId: number;
  source?: string;
  sourceCampaign?: string;
  status?: 'NEW' | 'CONTACTED' | 'QUALIFYING' | 'QUALIFIED' | 'UNQUALIFIED' | 'CONVERTED';
  temperature?: 'COLD' | 'WARM' | 'HOT';
  score?: number;
  productId?: string;
  campaignId?: string;
  detectedObjection?: string;
}

export type UpdateLeadDto = Partial<CreateLeadDto>;

export class LeadService {
  static async getLeads(
    workspaceId: number,
    options?: { status?: string; temperature?: string; limit?: number; offset?: number }
  ) {
    const conditions = [
      eq(schema.leads.workspaceId, workspaceId),
      isNull(schema.leads.deletedAt),
    ];

    if (options?.status) {
      conditions.push(eq(schema.leads.status, options.status.toUpperCase()));
    }
    if (options?.temperature) {
      conditions.push(eq(schema.leads.temperature, options.temperature.toUpperCase()));
    }

    const leadsList = await db
      .select()
      .from(schema.leads)
      .where(and(...conditions.filter(Boolean) as any))
      .orderBy(desc(schema.leads.createdAt))
      .limit(options?.limit || 100)
      .offset(options?.offset || 0);

    return leadsList;
  }

  static async getLeadById(workspaceId: number, leadId: number) {
    const list = await db
      .select()
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.workspaceId, workspaceId),
          eq(schema.leads.id, leadId),
          isNull(schema.leads.deletedAt)
        )
      )
      .limit(1);

    return list[0] || null;
  }

  static async createLead(workspaceId: number, dto: CreateLeadDto) {
    const [lead] = await db
      .insert(schema.leads)
      .values({
        workspaceId,
        contactId: dto.contactId,
        source: dto.source || 'DIRECT',
        sourceCampaign: dto.sourceCampaign || null,
        status: (dto.status?.toUpperCase() as any) || 'NEW',
        temperature: (dto.temperature?.toUpperCase() as any) || 'WARM',
        score: dto.score !== undefined ? dto.score : 50,
        productId: dto.productId || null,
        campaignId: dto.campaignId || null,
        detectedObjection: dto.detectedObjection || null,
      })
      .returning();

    // Log Activity
    await ActivityService.logActivity(workspaceId, {
      contactId: dto.contactId,
      leadId: lead.id,
      type: 'LEAD_CREATED',
      title: `Nuevo Lead Registrado (Interés comercial)`,
      description: `Score: ${lead.score}/100, Temperatura: ${lead.temperature}, Fuente: ${lead.source}`,
      stageBadge: 'Interés Comercial',
    });

    return lead;
  }

  static async updateLead(workspaceId: number, leadId: number, dto: UpdateLeadDto) {
    const updatePayload: Partial<typeof schema.leads.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (dto.source !== undefined) updatePayload.source = dto.source;
    if (dto.sourceCampaign !== undefined) updatePayload.sourceCampaign = dto.sourceCampaign;
    if (dto.status !== undefined) updatePayload.status = dto.status.toUpperCase();
    if (dto.temperature !== undefined) updatePayload.temperature = dto.temperature.toUpperCase();
    if (dto.score !== undefined) updatePayload.score = dto.score;
    if (dto.productId !== undefined) updatePayload.productId = dto.productId;
    if (dto.campaignId !== undefined) updatePayload.campaignId = dto.campaignId;
    if (dto.detectedObjection !== undefined) updatePayload.detectedObjection = dto.detectedObjection;

    const [updated] = await db
      .update(schema.leads)
      .set(updatePayload)
      .where(
        and(
          eq(schema.leads.workspaceId, workspaceId),
          eq(schema.leads.id, leadId),
          isNull(schema.leads.deletedAt)
        )
      )
      .returning();

    return updated || null;
  }

  static async deleteLead(workspaceId: number, leadId: number) {
    const [deleted] = await db
      .update(schema.leads)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.leads.workspaceId, workspaceId),
          eq(schema.leads.id, leadId)
        )
      )
      .returning();

    return deleted || null;
  }
}
