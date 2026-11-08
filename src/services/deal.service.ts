import { db } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { ActivityService } from './activity.service.ts';
import { PipelineService } from './pipeline.service.ts';

export interface CreateDealDto {
  contactId: number;
  leadId?: number;
  pipelineId?: number;
  stageId?: number;
  stageKey?: string;
  productId?: string;
  title: string;
  value: number;
  currency?: string;
  probability?: number;
  expectedCloseDate?: string;
  status?: 'OPEN' | 'WON' | 'LOST';
  assignedUserId?: number;
}

export type UpdateDealDto = Partial<CreateDealDto>;

export class DealService {
  static async getDeals(
    workspaceId: number,
    options?: { status?: string; stageKey?: string; stageId?: number; contactId?: number; limit?: number; offset?: number }
  ) {
    const conditions = [
      eq(schema.deals.workspaceId, workspaceId),
      isNull(schema.deals.deletedAt),
    ];

    if (options?.status) {
      conditions.push(eq(schema.deals.status, options.status.toUpperCase()));
    }
    if (options?.stageKey) {
      conditions.push(eq(schema.deals.stageKey, options.stageKey.toUpperCase()));
    }
    if (options?.stageId) {
      conditions.push(eq(schema.deals.stageId, options.stageId));
    }
    if (options?.contactId) {
      conditions.push(eq(schema.deals.contactId, options.contactId));
    }

    const dealsList = await db
      .select()
      .from(schema.deals)
      .where(and(...conditions.filter(Boolean) as any))
      .orderBy(desc(schema.deals.createdAt))
      .limit(options?.limit || 100)
      .offset(options?.offset || 0);

    return dealsList;
  }

  static async getDealById(workspaceId: number, dealId: number) {
    const list = await db
      .select()
      .from(schema.deals)
      .where(
        and(
          eq(schema.deals.workspaceId, workspaceId),
          eq(schema.deals.id, dealId),
          isNull(schema.deals.deletedAt)
        )
      )
      .limit(1);

    return list[0] || null;
  }

  static async createDeal(workspaceId: number, dto: CreateDealDto) {
    // If no pipelineId provided, resolve default
    let pipelineId = dto.pipelineId;
    if (!pipelineId) {
      const pipeline = await PipelineService.ensureDefaultPipeline(workspaceId);
      pipelineId = pipeline.id;
    }

    // Resolve stageId from stageKey or vice versa
    let stageId = dto.stageId;
    let stageKey = dto.stageKey ? dto.stageKey.toUpperCase() : 'NEW';

    const stages = await PipelineService.getStages(workspaceId, pipelineId);
    if (stageId && !dto.stageKey) {
      const matched = stages.find((s) => s.id === stageId);
      if (matched) stageKey = matched.key;
    } else if (stageKey && !stageId) {
      const matched = stages.find((s) => s.key === stageKey);
      if (matched) stageId = matched.id;
    }

    const isWon = stageKey === 'WON' || dto.status === 'WON';
    const isLost = stageKey === 'LOST' || dto.status === 'LOST';
    const status = isWon ? 'WON' : isLost ? 'LOST' : (dto.status || 'OPEN');

    const formattedValue = (typeof dto.value === 'number' ? dto.value : parseFloat(dto.value || 0)).toFixed(2);

    const [deal] = await db
      .insert(schema.deals)
      .values({
        workspaceId,
        contactId: dto.contactId,
        leadId: dto.leadId || null,
        pipelineId,
        stageId: stageId || null,
        stageKey,
        productId: dto.productId || null,
        title: dto.title,
        value: formattedValue,
        currency: (dto.currency || 'USD').toUpperCase(),
        probability: dto.probability !== undefined ? dto.probability : (isWon ? 100 : 50),
        expectedCloseDate: dto.expectedCloseDate || null,
        status,
        assignedUserId: dto.assignedUserId || null,
        wonAt: isWon ? new Date() : null,
        lostAt: isLost ? new Date() : null,
      })
      .returning();

    // Log Activity
    await ActivityService.logActivity(workspaceId, {
      contactId: dto.contactId,
      leadId: dto.leadId,
      dealId: deal.id,
      type: isWon ? 'DEAL_WON' : 'DEAL_CREATED',
      title: isWon ? `Oportunidad Ganada: ${deal.title}` : `Nueva Oportunidad: ${deal.title}`,
      description: `Valor: $${deal.value} ${deal.currency} | Etapa: ${deal.stageKey}`,
      stageBadge: isWon ? 'Ganado ✨' : deal.stageKey,
    });

    return deal;
  }

  static async updateDeal(workspaceId: number, dealId: number, dto: UpdateDealDto) {
    const existing = await this.getDealById(workspaceId, dealId);
    if (!existing) return null;

    const updatePayload: Partial<typeof schema.deals.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (dto.title !== undefined) updatePayload.title = dto.title;
    if (dto.value !== undefined) updatePayload.value = (typeof dto.value === 'number' ? dto.value : parseFloat(dto.value || 0)).toFixed(2);
    if (dto.currency !== undefined) updatePayload.currency = dto.currency.toUpperCase();
    if (dto.probability !== undefined) updatePayload.probability = dto.probability;
    if (dto.expectedCloseDate !== undefined) updatePayload.expectedCloseDate = dto.expectedCloseDate;
    if (dto.assignedUserId !== undefined) updatePayload.assignedUserId = dto.assignedUserId;
    if (dto.productId !== undefined) updatePayload.productId = dto.productId;

    if (dto.stageKey !== undefined || dto.stageId !== undefined || dto.status !== undefined) {
      let stageKey = dto.stageKey ? dto.stageKey.toUpperCase() : existing.stageKey;
      let stageId = dto.stageId || existing.stageId;

      const stages = await PipelineService.getStages(workspaceId, existing.pipelineId || undefined);
      if (dto.stageKey && !dto.stageId) {
        const matched = stages.find((s) => s.key === stageKey);
        if (matched) stageId = matched.id;
      } else if (dto.stageId && !dto.stageKey) {
        const matched = stages.find((s) => s.id === stageId);
        if (matched) stageKey = matched.key;
      }

      const isWon = stageKey === 'WON' || dto.status === 'WON';
      const isLost = stageKey === 'LOST' || dto.status === 'LOST';
      const status = isWon ? 'WON' : isLost ? 'LOST' : (dto.status || existing.status);

      updatePayload.stageKey = stageKey;
      updatePayload.stageId = stageId;
      updatePayload.status = status;

      if (isWon && !existing.wonAt) updatePayload.wonAt = new Date();
      if (isLost && !existing.lostAt) updatePayload.lostAt = new Date();

      // Log Activity on stage change
      if (stageKey !== existing.stageKey || status !== existing.status) {
        await ActivityService.logActivity(workspaceId, {
          contactId: existing.contactId,
          leadId: existing.leadId || undefined,
          dealId: existing.id,
          type: isWon ? 'DEAL_WON' : isLost ? 'DEAL_LOST' : 'STAGE_CHANGED',
          title: isWon ? `¡Trato Ganado y Cerrado! ✨` : isLost ? `Trato marcado como Perdido` : `Etapa cambiada a ${stageKey}`,
          description: `Valor comercial: $${updatePayload.value || existing.value} ${existing.currency}`,
          stageBadge: isWon ? 'Ganado ✨' : stageKey,
        });
      }
    }

    const [updated] = await db
      .update(schema.deals)
      .set(updatePayload)
      .where(
        and(
          eq(schema.deals.workspaceId, workspaceId),
          eq(schema.deals.id, dealId),
          isNull(schema.deals.deletedAt)
        )
      )
      .returning();

    return updated || null;
  }

  static async markDealWon(workspaceId: number, dealId: number) {
    return await this.updateDeal(workspaceId, dealId, {
      stageKey: 'WON',
      status: 'WON',
    });
  }

  static async markDealLost(workspaceId: number, dealId: number) {
    return await this.updateDeal(workspaceId, dealId, {
      stageKey: 'LOST',
      status: 'LOST',
    });
  }

  static async deleteDeal(workspaceId: number, dealId: number) {
    const [deleted] = await db
      .update(schema.deals)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.deals.workspaceId, workspaceId),
          eq(schema.deals.id, dealId)
        )
      )
      .returning();

    return deleted || null;
  }
}
