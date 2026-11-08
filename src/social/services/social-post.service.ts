import { eq, and, desc, gte, lte, isNull, inArray } from 'drizzle-orm';
import { db } from '../../db';
import {
  socialPosts,
  socialPostTargets,
  socialMediaAssets,
  socialPostAnalytics,
  socialAccounts,
  products,
} from '../../db/schema';
import { SocialPostStatus } from '../types';

export interface CreatePostInput {
  workspaceId: number;
  title?: string;
  caption: string;
  contentType?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'REEL' | 'CAROUSEL';
  objective?: 'AWARENESS' | 'ENGAGEMENT' | 'LEADS' | 'SALES' | 'EDUCATION' | 'PROMOTION';
  productId?: string | null;
  campaignId?: string | null;
  cta?: string | null;
  targetAccountIds: number[];
  mediaAssets?: {
    type: 'IMAGE' | 'VIDEO';
    url: string;
    mimeType?: string;
    size?: number;
    width?: number;
    height?: number;
    duration?: number;
    position?: number;
  }[];
  scheduledAt?: string | null;
  status?: 'DRAFT' | 'SCHEDULED';
  createdById?: number;
}

export class SocialPostService {
  /**
   * Create a new post with targets and media assets
   */
  static async createPost(input: CreatePostInput) {
    const isScheduled = !!input.scheduledAt && (input.status === 'SCHEDULED' || !input.status);
    const initialStatus: SocialPostStatus = isScheduled ? 'SCHEDULED' : input.status || 'DRAFT';

    // 1. Insert post record
    const [post] = await db
      .insert(socialPosts)
      .values({
        workspaceId: input.workspaceId,
        title: input.title,
        caption: input.caption,
        contentType: input.contentType || 'IMAGE',
        objective: input.objective || 'LEADS',
        status: initialStatus,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        productId: input.productId || null,
        campaignId: input.campaignId || null,
        cta: input.cta || null,
        createdById: input.createdById,
      })
      .returning();

    // 2. Fetch target accounts to get platform info
    const accounts = await db
      .select()
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.workspaceId, input.workspaceId),
          inArray(socialAccounts.id, input.targetAccountIds)
        )
      );

    // 3. Create target records
    if (accounts.length > 0) {
      for (const acc of accounts) {
        await db.insert(socialPostTargets).values({
          workspaceId: input.workspaceId,
          socialPostId: post.id,
          socialAccountId: acc.id,
          platform: acc.platform,
          status: 'PENDING',
        });
      }
    }

    // 4. Create media assets
    if (input.mediaAssets && input.mediaAssets.length > 0) {
      for (let i = 0; i < input.mediaAssets.length; i++) {
        const asset = input.mediaAssets[i];
        await db.insert(socialMediaAssets).values({
          workspaceId: input.workspaceId,
          socialPostId: post.id,
          type: asset.type,
          url: asset.url,
          mimeType: asset.mimeType,
          size: asset.size,
          width: asset.width,
          height: asset.height,
          duration: asset.duration,
          position: asset.position !== undefined ? asset.position : i,
        });
      }
    }

    return this.getPostById(input.workspaceId, post.id);
  }

  /**
   * Get single post with all relations (targets, media, analytics, product)
   */
  static async getPostById(workspaceId: number, postId: number) {
    const [post] = await db
      .select()
      .from(socialPosts)
      .where(and(eq(socialPosts.id, postId), eq(socialPosts.workspaceId, workspaceId), isNull(socialPosts.deletedAt)))
      .limit(1);

    if (!post) return null;

    const targets = await db
      .select({
        id: socialPostTargets.id,
        platform: socialPostTargets.platform,
        status: socialPostTargets.status,
        externalPostId: socialPostTargets.externalPostId,
        externalPostUrl: socialPostTargets.externalPostUrl,
        publishedAt: socialPostTargets.publishedAt,
        errorCode: socialPostTargets.errorCode,
        errorMessage: socialPostTargets.errorMessage,
        account: {
          id: socialAccounts.id,
          name: socialAccounts.name,
          username: socialAccounts.username,
          profilePictureUrl: socialAccounts.profilePictureUrl,
        },
      })
      .from(socialPostTargets)
      .leftJoin(socialAccounts, eq(socialPostTargets.socialAccountId, socialAccounts.id))
      .where(and(eq(socialPostTargets.socialPostId, postId), eq(socialPostTargets.workspaceId, workspaceId)));

    const media = await db
      .select()
      .from(socialMediaAssets)
      .where(and(eq(socialMediaAssets.socialPostId, postId), eq(socialMediaAssets.workspaceId, workspaceId)))
      .orderBy(socialMediaAssets.position);

    const analytics = await db
      .select()
      .from(socialPostAnalytics)
      .where(and(eq(socialPostAnalytics.socialPostId, postId), eq(socialPostAnalytics.workspaceId, workspaceId)));

    let product = null;
    if (post.productId) {
      const [prod] = await db
        .select()
        .from(products)
        .where(eq(products.id, post.productId))
        .limit(1);
      product = prod;
    }

    return {
      ...post,
      targets,
      media,
      analytics,
      product,
    };
  }

  /**
   * List posts for a workspace with rich filtering
   */
  static async getWorkspacePosts(
    workspaceId: number,
    filters?: {
      status?: SocialPostStatus;
      productId?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    }
  ) {
    let query = db
      .select()
      .from(socialPosts)
      .where(
        and(
          eq(socialPosts.workspaceId, workspaceId),
          isNull(socialPosts.deletedAt),
          filters?.status ? eq(socialPosts.status, filters.status) : undefined,
          filters?.productId ? eq(socialPosts.productId, filters.productId) : undefined,
          filters?.startDate ? gte(socialPosts.scheduledAt, filters.startDate) : undefined,
          filters?.endDate ? lte(socialPosts.scheduledAt, filters.endDate) : undefined
        )
      )
      .orderBy(desc(socialPosts.createdAt))
      .limit(filters?.limit || 50)
      .offset(filters?.offset || 0);

    const rawPosts = await query;
    const enriched = await Promise.all(
      rawPosts.map((p) => this.getPostById(workspaceId, p.id))
    );

    return enriched.filter(Boolean);
  }

  /**
   * Update a post
   */
  static async updatePost(workspaceId: number, postId: number, input: Partial<CreatePostInput>) {
    const [existing] = await db
      .select()
      .from(socialPosts)
      .where(and(eq(socialPosts.id, postId), eq(socialPosts.workspaceId, workspaceId)))
      .limit(1);

    if (!existing) {
      throw new Error('Publicación no encontrada.');
    }

    const updateData: any = { updatedAt: new Date() };
    if (input.title !== undefined) updateData.title = input.title;
    if (input.caption !== undefined) updateData.caption = input.caption;
    if (input.contentType !== undefined) updateData.contentType = input.contentType;
    if (input.objective !== undefined) updateData.objective = input.objective;
    if (input.productId !== undefined) updateData.productId = input.productId;
    if (input.cta !== undefined) updateData.cta = input.cta;
    if (input.scheduledAt !== undefined) {
      updateData.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
      if (input.scheduledAt && existing.status === 'DRAFT') {
        updateData.status = 'SCHEDULED';
      }
    }
    if (input.status !== undefined) updateData.status = input.status;

    await db
      .update(socialPosts)
      .set(updateData)
      .where(eq(socialPosts.id, postId));

    // Update targets if targetAccountIds provided
    if (input.targetAccountIds && input.targetAccountIds.length > 0) {
      // Remove old targets
      await db.delete(socialPostTargets).where(eq(socialPostTargets.socialPostId, postId));

      const accounts = await db
        .select()
        .from(socialAccounts)
        .where(
          and(
            eq(socialAccounts.workspaceId, workspaceId),
            inArray(socialAccounts.id, input.targetAccountIds)
          )
        );

      for (const acc of accounts) {
        await db.insert(socialPostTargets).values({
          workspaceId,
          socialPostId: postId,
          socialAccountId: acc.id,
          platform: acc.platform,
          status: 'PENDING',
        });
      }
    }

    return this.getPostById(workspaceId, postId);
  }

  /**
   * Soft delete a draft or scheduled post
   */
  static async deletePost(workspaceId: number, postId: number) {
    const [deleted] = await db
      .update(socialPosts)
      .set({ deletedAt: new Date(), status: 'FAILED', updatedAt: new Date() })
      .where(and(eq(socialPosts.id, postId), eq(socialPosts.workspaceId, workspaceId)))
      .returning();

    return !!deleted;
  }
}
