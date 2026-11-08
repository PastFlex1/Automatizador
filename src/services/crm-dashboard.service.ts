import { db } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import { eq, and, isNull, ne, notInArray, desc, or, ilike, sql } from 'drizzle-orm';

export interface DashboardMetrics {
  activeProspects: number;
  pipelineValue: {
    amount: number;
    currency: string;
  };
  hotLeads: number;
  wonDeals: number;
}

export class CrmDashboardService {
  static async getDashboardMetrics(workspaceId: number): Promise<DashboardMetrics> {
    // 1. Active prospects: leads that are not unqualified and not converted, and not deleted
    const activeLeadsResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.workspaceId, workspaceId),
          isNull(schema.leads.deletedAt),
          notInArray(schema.leads.status, ['UNQUALIFIED', 'CONVERTED'])
        )
      );

    const activeProspects = activeLeadsResult[0]?.count || 0;

    // 2. Pipeline Value: sum of open deals (not deleted)
    const pipelineValueResult = await db
      .select({
        totalAmount: sql<string>`coalesce(sum(${schema.deals.value}), '0')`,
        currency: schema.deals.currency,
      })
      .from(schema.deals)
      .where(
        and(
          eq(schema.deals.workspaceId, workspaceId),
          isNull(schema.deals.deletedAt),
          eq(schema.deals.status, 'OPEN')
        )
      )
      .groupBy(schema.deals.currency);

    const amount = pipelineValueResult.length > 0
      ? parseFloat(pipelineValueResult[0].totalAmount || '0')
      : 0;
    const currency = pipelineValueResult[0]?.currency || 'USD';

    // 3. Hot leads: leads with temperature = 'HOT' and not converted/deleted
    const hotLeadsResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.workspaceId, workspaceId),
          isNull(schema.leads.deletedAt),
          eq(schema.leads.temperature, 'HOT'),
          ne(schema.leads.status, 'CONVERTED')
        )
      );

    const hotLeads = hotLeadsResult[0]?.count || 0;

    // 4. Won deals: deals with status = 'WON' and not deleted
    const wonDealsResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.deals)
      .where(
        and(
          eq(schema.deals.workspaceId, workspaceId),
          isNull(schema.deals.deletedAt),
          eq(schema.deals.status, 'WON')
        )
      );

    const wonDeals = wonDealsResult[0]?.count || 0;

    return {
      activeProspects,
      pipelineValue: {
        amount,
        currency,
      },
      hotLeads,
      wonDeals,
    };
  }

  static async getInboxProspects(
    workspaceId: number,
    filters?: {
      channel?: string;
      temperature?: string;
      status?: string;
      search?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    // Single consolidated query joining contacts, leads, conversations, and deals
    const query = db
      .select({
        contactId: schema.contacts.id,
        contactName: schema.contacts.name,
        firstName: schema.contacts.firstName,
        lastName: schema.contacts.lastName,
        email: schema.contacts.email,
        phone: schema.contacts.phone,
        avatarUrl: schema.contacts.avatarUrl,
        company: schema.contacts.company,
        jobTitle: schema.contacts.jobTitle,
        tags: schema.contacts.tags,
        leadId: schema.leads.id,
        leadScore: schema.leads.score,
        leadTemperature: schema.leads.temperature,
        leadStatus: schema.leads.status,
        detectedObjection: schema.leads.detectedObjection,
        conversationId: schema.conversations.id,
        principalChannel: schema.conversations.channel,
        conversationStatus: schema.conversations.status,
        lastMessage: schema.conversations.lastMessage,
        lastMessageAt: schema.conversations.lastMessageAt,
        unreadCount: schema.conversations.unreadCount,
        dealId: schema.deals.id,
        dealTitle: schema.deals.title,
        dealStageKey: schema.deals.stageKey,
        dealStatus: schema.deals.status,
        dealValue: schema.deals.value,
        dealCurrency: schema.deals.currency,
      })
      .from(schema.contacts)
      .leftJoin(
        schema.leads,
        and(
          eq(schema.leads.contactId, schema.contacts.id),
          isNull(schema.leads.deletedAt)
        )
      )
      .leftJoin(
        schema.conversations,
        eq(schema.conversations.contactId, schema.contacts.id)
      )
      .leftJoin(
        schema.deals,
        and(
          eq(schema.deals.contactId, schema.contacts.id),
          isNull(schema.deals.deletedAt)
        )
      )
      .where(
        and(
          eq(schema.contacts.workspaceId, workspaceId),
          isNull(schema.contacts.deletedAt),
          filters?.channel
            ? eq(schema.conversations.channel, filters.channel.toUpperCase())
            : undefined,
          filters?.temperature
            ? eq(schema.leads.temperature, filters.temperature.toUpperCase())
            : undefined,
          filters?.status
            ? eq(schema.leads.status, filters.status.toUpperCase())
            : undefined,
          filters?.search
            ? or(
                ilike(schema.contacts.name, `%${filters.search}%`),
                ilike(schema.contacts.email, `%${filters.search}%`),
                ilike(schema.contacts.phone, `%${filters.search}%`),
                ilike(schema.conversations.lastMessage, `%${filters.search}%`)
              )
            : undefined
        )
      )
      .orderBy(desc(schema.conversations.lastMessageAt), desc(schema.contacts.createdAt))
      .limit(filters?.limit || 50)
      .offset(filters?.offset || 0);

    const rows = await query;

    // Deduplicate by contactId if multiple deals exist per contact
    const contactMap = new Map<number, any>();
    for (const r of rows) {
      if (!contactMap.has(r.contactId)) {
        contactMap.set(r.contactId, {
          id: r.leadId || r.contactId,
          contactId: r.contactId,
          name: r.contactName,
          firstName: r.firstName,
          lastName: r.lastName,
          email: r.email,
          phone: r.phone,
          avatar: r.avatarUrl,
          company: r.company,
          jobTitle: r.jobTitle,
          tags: r.tags || [],
          principalChannel: (r.principalChannel || 'WHATSAPP').toLowerCase(),
          lastMessage: r.lastMessage || 'Contacto registrado',
          lastMessageAt: r.lastMessageAt,
          unreadCount: r.unreadCount || 0,
          leadTemperature: (r.leadTemperature || 'WARM').toUpperCase(),
          leadStatus: (r.leadStatus || 'NEW').toUpperCase(),
          leadScore: r.leadScore || 50,
          detectedObjection: r.detectedObjection,
          conversationId: r.conversationId,
          deal: r.dealId
            ? {
                id: r.dealId,
                title: r.dealTitle,
                stage: r.dealStageKey || 'NEW',
                status: r.dealStatus || 'OPEN',
                value: parseFloat(r.dealValue || '0'),
                currency: r.dealCurrency || 'USD',
              }
            : null,
        });
      }
    }

    return Array.from(contactMap.values());
  }
}
