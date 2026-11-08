import { eq, and } from 'drizzle-orm';
import { db } from '../../db';
import {
  socialPosts,
  socialPostTargets,
  socialMediaAssets,
  socialAccounts,
  activities,
} from '../../db/schema';
import { SocialAccountService } from './social-account.service';
import { FacebookAdapter } from '../adapters/facebook.adapter';
import { InstagramAdapter } from '../adapters/instagram.adapter';
import { ThreadsAdapter } from '../adapters/threads.adapter';
import { MockSocialAdapter } from '../adapters/mock.adapter';
import { SocialPublisherAdapter } from '../adapters/social-publisher.adapter';
import { PublishRequest, PublishResult, SocialPlatform } from '../types';

export class SocialPublisherService {
  private static overrideMode: 'mock' | 'meta' | null = null;

  /**
   * Set publisher mode at runtime (e.g. from UI or test controller)
   */
  static setPublisherMode(mode: 'mock' | 'meta') {
    if (mode !== 'mock' && mode !== 'meta') {
      throw new Error(`Modo inválido: '${mode}'. Solo se admite 'mock' o 'meta'.`);
    }
    this.overrideMode = mode;
    process.env.SOCIAL_PUBLISHER_MODE = mode;
  }

  /**
   * Determine publisher mode: 'mock' (simulation) or 'meta' (real official Meta Graph API)
   * Fail closed on unknown or invalid configuration.
   */
  static getPublisherMode(): 'mock' | 'meta' {
    if (this.overrideMode) {
      return this.overrideMode;
    }
    const rawMode = (process.env.SOCIAL_PUBLISHER_MODE || 'mock').trim().toLowerCase();
    if (rawMode === 'meta' || rawMode === 'live' || rawMode === 'real') {
      return 'meta';
    }
    if (rawMode === 'mock') {
      return 'mock';
    }
    // Fail-closed for any unrecognized mode
    throw new Error(
      `Modo de publicación no reconocido: '${rawMode}'. Configura SOCIAL_PUBLISHER_MODE en 'mock' o 'meta'.`
    );
  }

  private static getAdapter(platform: SocialPlatform): SocialPublisherAdapter {
    const mode = this.getPublisherMode();

    if (mode === 'mock') {
      return new MockSocialAdapter(platform);
    }

    switch (platform) {
      case 'FACEBOOK':
        return new FacebookAdapter();
      case 'INSTAGRAM':
        return new InstagramAdapter();
      case 'THREADS':
        return new ThreadsAdapter();
      default:
        throw new Error(`Plataforma ${platform} no soportada para publicación en modo Meta.`);
    }
  }

  /**
   * Execute controlled publication of a social post to all its configured targets
   */
  static async publishPost(workspaceId: number, postId: number) {
    // 1. Fetch Post with workspace isolation
    const [post] = await db
      .select()
      .from(socialPosts)
      .where(and(eq(socialPosts.id, postId), eq(socialPosts.workspaceId, workspaceId)))
      .limit(1);

    if (!post) {
      throw new Error(`Publicación #${postId} no encontrada en el workspace.`);
    }

    // 2. Idempotency Check: Prevent duplicate publishing attempts
    if (post.status === 'PROCESSING') {
      throw new Error(`La publicación #${postId} ya se está procesando actualmente.`);
    }

    if (post.status === 'PUBLISHED') {
      throw new Error(`La publicación #${postId} ya fue publicada exitosamente.`);
    }

    // Set post status to PROCESSING atomically
    await db
      .update(socialPosts)
      .set({ status: 'PROCESSING', updatedAt: new Date() })
      .where(and(eq(socialPosts.id, postId), eq(socialPosts.workspaceId, workspaceId)));

    // Log Activity: SOCIAL_POST_PUBLISH_STARTED
    try {
      await db.insert(activities).values({
        workspaceId,
        type: 'NOTE_ADDED',
        title: 'SOCIAL_POST_PUBLISH_STARTED',
        description: `Inicio de procesamiento para publicación #${postId} (${post.contentType}).`,
        metadata: { postId, contentType: post.contentType },
      });
    } catch {
      // Non-blocking activity audit
    }

    // 3. Fetch Media Assets
    const assets = await db
      .select()
      .from(socialMediaAssets)
      .where(and(eq(socialMediaAssets.socialPostId, postId), eq(socialMediaAssets.workspaceId, workspaceId)));

    // 4. Fetch Targets
    const targets = await db
      .select()
      .from(socialPostTargets)
      .where(and(eq(socialPostTargets.socialPostId, postId), eq(socialPostTargets.workspaceId, workspaceId)));

    if (targets.length === 0) {
      await db
        .update(socialPosts)
        .set({ status: 'FAILED', updatedAt: new Date() })
        .where(eq(socialPosts.id, postId));
      throw new Error('La publicación no tiene canales destino configurados.');
    }

    const results: {
      targetId: number;
      platform: SocialPlatform;
      accountName?: string;
      result: PublishResult;
    }[] = [];

    // 5. Publish to each target sequentially
    for (const target of targets) {
      const account = await SocialAccountService.getAccountInternal(workspaceId, target.socialAccountId);

      if (!account || account.status !== 'CONNECTED' || !account.accessToken) {
        const isExpired = account?.status === 'EXPIRED';
        const failedResult: PublishResult = {
          success: false,
          errorCode: isExpired ? 'TOKEN_EXPIRED' : 'ACCOUNT_NOT_CONNECTED',
          errorMessage: isExpired
            ? 'El token de esta cuenta ha expirado. Vuelve a conectar tu cuenta de Meta.'
            : 'La cuenta social vinculada no existe o no está conectada activamente en este Workspace.',
        };

        await db
          .update(socialPostTargets)
          .set({
            status: 'FAILED',
            errorCode: failedResult.errorCode,
            errorMessage: failedResult.errorMessage,
            updatedAt: new Date(),
          })
          .where(eq(socialPostTargets.id, target.id));

        results.push({
          targetId: target.id,
          platform: target.platform as SocialPlatform,
          accountName: account?.name,
          result: failedResult,
        });
        continue;
      }

      // Mark target as PROCESSING
      await db
        .update(socialPostTargets)
        .set({ status: 'PROCESSING', updatedAt: new Date() })
        .where(eq(socialPostTargets.id, target.id));

      const adapter = this.getAdapter(target.platform as SocialPlatform);

      const publishRequest: PublishRequest = {
        workspaceId,
        postId: post.id,
        targetId: target.id,
        platform: target.platform as SocialPlatform,
        accountId: account.id,
        accessToken: account.accessToken,
        externalAccountId: account.externalAccountId,
        caption: post.caption,
        contentType: post.contentType as any,
        mediaAssets: assets.map((a) => ({
          type: a.type as 'IMAGE' | 'VIDEO',
          url: a.url,
          position: a.position,
        })),
      };

      try {
        const publishResult = await adapter.publish(publishRequest);

        if (publishResult.success) {
          await db
            .update(socialPostTargets)
            .set({
              status: 'PUBLISHED',
              externalPostId: publishResult.externalPostId,
              externalPostUrl: publishResult.externalPostUrl,
              publishedAt: new Date(),
              errorCode: null,
              errorMessage: null,
              metadata: publishResult.metadata || {},
              updatedAt: new Date(),
            })
            .where(eq(socialPostTargets.id, target.id));
        } else {
          // If token expired, auto-update account status to EXPIRED
          if (publishResult.errorCode === 'TOKEN_EXPIRED') {
            await db
              .update(socialAccounts)
              .set({ status: 'EXPIRED', updatedAt: new Date() })
              .where(eq(socialAccounts.id, account.id));
          }

          await db
            .update(socialPostTargets)
            .set({
              status: 'FAILED',
              errorCode: publishResult.errorCode,
              errorMessage: publishResult.errorMessage,
              updatedAt: new Date(),
            })
            .where(eq(socialPostTargets.id, target.id));
        }

        results.push({
          targetId: target.id,
          platform: target.platform as SocialPlatform,
          accountName: account.name,
          result: publishResult,
        });
      } catch (err: any) {
        const exceptionResult: PublishResult = {
          success: false,
          errorCode: 'UNHANDLED_EXCEPTION',
          errorMessage: err.message || 'Error inesperado durante la publicación',
        };

        await db
          .update(socialPostTargets)
          .set({
            status: 'FAILED',
            errorCode: exceptionResult.errorCode,
            errorMessage: exceptionResult.errorMessage,
            updatedAt: new Date(),
          })
          .where(eq(socialPostTargets.id, target.id));

        results.push({
          targetId: target.id,
          platform: target.platform as SocialPlatform,
          accountName: account.name,
          result: exceptionResult,
        });
      }
    }

    // 6. Calculate final post status & handle partial errors
    const successfulCount = results.filter((r) => r.result.success).length;
    let finalStatus: 'PUBLISHED' | 'PARTIALLY_PUBLISHED' | 'FAILED' = 'FAILED';

    if (successfulCount === results.length && results.length > 0) {
      finalStatus = 'PUBLISHED';
    } else if (successfulCount > 0) {
      finalStatus = 'PARTIALLY_PUBLISHED';
    } else {
      finalStatus = 'FAILED';
    }

    const [updatedPost] = await db
      .update(socialPosts)
      .set({
        status: finalStatus,
        publishedAt: finalStatus !== 'FAILED' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(socialPosts.id, postId))
      .returning();

    // 7. Log Activity in CRM: SOCIAL_POST_PUBLISHED or SOCIAL_POST_FAILED
    try {
      const activityType = finalStatus !== 'FAILED' ? 'SOCIAL_POST_PUBLISHED' : 'SOCIAL_POST_FAILED';
      await db.insert(activities).values({
        workspaceId,
        type: 'NOTE_ADDED',
        title: activityType,
        description: `Publicación #${postId}: ${finalStatus} (${successfulCount}/${results.length} canales exitosos).`,
        metadata: {
          postId,
          finalStatus,
          targetsCount: results.length,
          successfulCount,
        },
      });
    } catch {
      // Activity logging is non-blocking
    }

    return {
      post: updatedPost,
      results,
      status: finalStatus,
      publisherMode: this.getPublisherMode(),
    };
  }
}
