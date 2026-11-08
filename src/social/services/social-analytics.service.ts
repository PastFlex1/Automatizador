import { eq, and, sql, isNull, desc } from 'drizzle-orm';
import { db } from '../../db';
import {
  socialPosts,
  socialPostAnalytics,
  socialPostTargets,
  leads,
  deals,
  products,
} from '../../db/schema';

export class SocialAnalyticsService {
  static async getWorkspaceAnalytics(workspaceId: number) {
    // 1. Post Counts by Status
    const posts = await db
      .select({
        status: socialPosts.status,
        count: sql<number>`count(*)::int`,
      })
      .from(socialPosts)
      .where(and(eq(socialPosts.workspaceId, workspaceId), isNull(socialPosts.deletedAt)))
      .groupBy(socialPosts.status);

    const statusCounts: Record<string, number> = {
      DRAFT: 0,
      SCHEDULED: 0,
      PUBLISHED: 0,
      PARTIALLY_PUBLISHED: 0,
      FAILED: 0,
    };
    posts.forEach((p) => {
      statusCounts[p.status] = p.count;
    });

    // 2. Aggregate Social Metrics (Impressions, Reach, Likes, Comments, Shares)
    const [aggregates] = await db
      .select({
        totalImpressions: sql<number>`coalesce(sum(${socialPostAnalytics.impressions}), 0)::int`,
        totalReach: sql<number>`coalesce(sum(${socialPostAnalytics.reach}), 0)::int`,
        totalLikes: sql<number>`coalesce(sum(${socialPostAnalytics.likes}), 0)::int`,
        totalComments: sql<number>`coalesce(sum(${socialPostAnalytics.comments}), 0)::int`,
        totalShares: sql<number>`coalesce(sum(${socialPostAnalytics.shares}), 0)::int`,
        totalClicks: sql<number>`coalesce(sum(${socialPostAnalytics.clicks}), 0)::int`,
      })
      .from(socialPostAnalytics)
      .where(eq(socialPostAnalytics.workspaceId, workspaceId));

    // 3. Commercial CRM Conversion Attribution: Leads and Deals generated from Social Posts
    const [commercialAttr] = await db
      .select({
        attributedLeads: sql<number>`coalesce(count(distinct ${leads.id}), 0)::int`,
        attributedDeals: sql<number>`coalesce(count(distinct ${deals.id}), 0)::int`,
        attributedRevenue: sql<string>`coalesce(sum(case when ${deals.stageId} is not null then ${deals.value} else 0 end), 0)::text`,
      })
      .from(leads)
      .leftJoin(deals, eq(deals.leadId, leads.id))
      .where(and(eq(leads.workspaceId, workspaceId), sql`${leads.sourceSocialPostId} is not null`));

    // 4. Platform Breakdown
    const platformBreakdown = await db
      .select({
        platform: socialPostTargets.platform,
        publishedCount: sql<number>`count(case when ${socialPostTargets.status} = 'PUBLISHED' then 1 end)::int`,
        totalImpressions: sql<number>`coalesce(sum(${socialPostAnalytics.impressions}), 0)::int`,
        totalLikes: sql<number>`coalesce(sum(${socialPostAnalytics.likes}), 0)::int`,
        totalComments: sql<number>`coalesce(sum(${socialPostAnalytics.comments}), 0)::int`,
      })
      .from(socialPostTargets)
      .leftJoin(socialPostAnalytics, eq(socialPostAnalytics.socialPostTargetId, socialPostTargets.id))
      .where(eq(socialPostTargets.workspaceId, workspaceId))
      .groupBy(socialPostTargets.platform);

    // 5. Top Performing Posts
    const topPosts = await db
      .select({
        id: socialPosts.id,
        title: socialPosts.title,
        caption: socialPosts.caption,
        contentType: socialPosts.contentType,
        publishedAt: socialPosts.publishedAt,
        impressions: sql<number>`coalesce(sum(${socialPostAnalytics.impressions}), 0)::int`,
        likes: sql<number>`coalesce(sum(${socialPostAnalytics.likes}), 0)::int`,
        comments: sql<number>`coalesce(sum(${socialPostAnalytics.comments}), 0)::int`,
      })
      .from(socialPosts)
      .leftJoin(socialPostAnalytics, eq(socialPostAnalytics.socialPostId, socialPosts.id))
      .where(and(eq(socialPosts.workspaceId, workspaceId), eq(socialPosts.status, 'PUBLISHED')))
      .groupBy(socialPosts.id, socialPosts.title, socialPosts.caption, socialPosts.contentType, socialPosts.publishedAt)
      .orderBy(desc(sql`coalesce(sum(${socialPostAnalytics.impressions}), 0)`))
      .limit(5);

    return {
      statusCounts,
      totalPosts: Object.values(statusCounts).reduce((a, b) => a + b, 0),
      metrics: {
        impressions: aggregates?.totalImpressions || 0,
        reach: aggregates?.totalReach || 0,
        likes: aggregates?.totalLikes || 0,
        comments: aggregates?.totalComments || 0,
        shares: aggregates?.totalShares || 0,
        clicks: aggregates?.totalClicks || 0,
      },
      commercialAttribution: {
        leadsGenerated: commercialAttr?.attributedLeads || 0,
        dealsGenerated: commercialAttr?.attributedDeals || 0,
        revenueGenerated: parseFloat(commercialAttr?.attributedRevenue || '0'),
      },
      platformBreakdown,
      topPosts,
    };
  }
}
