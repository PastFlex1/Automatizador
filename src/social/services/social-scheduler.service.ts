import { eq, and, lte, isNull } from 'drizzle-orm';
import { db } from '../../db';
import { socialPosts } from '../../db/schema';
import { SocialPublisherService } from './social-publisher.service';
import { AutoPilotService } from './auto-pilot.service';
import { SocialFallbackStorage } from '../storage/social-fallback.storage';

export class SocialSchedulerService {
  private static timer: NodeJS.Timeout | null = null;
  private static isRunning = false;

  /**
   * Start scheduler background worker
   */
  static startScheduler(intervalMs = 30000) {
    if (this.timer) return;

    this.timer = setInterval(async () => {
      await this.processDuePosts();
    }, intervalMs);

    // Initial check on boot
    setTimeout(() => {
      this.processDuePosts().catch((err) => console.error('Initial scheduler check failed:', err));
    }, 5000);
  }

  /**
   * Stop scheduler background worker
   */
  static stopScheduler() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Find and execute all due posts across DB and local fallback
   */
  static async processDuePosts(): Promise<number> {
    if (this.isRunning) return 0;
    this.isRunning = true;

    let processedCount = 0;

    try {
      // 1. Process Local Fallback & AutoPilot Scheduled Posts
      try {
        const localProcessed = await AutoPilotService.processDueScheduledPosts();
        processedCount += localProcessed;
      } catch (localErr) {
        console.warn('[SocialScheduler] Local scheduled posts process error:', localErr);
      }

      // 2. Process AutoPilot Recurring Post if enabled and due
      try {
        const settings = SocialFallbackStorage.getAutoPilotSettings();
        if (settings.enabled) {
          const now = Date.now();
          const lastTime = settings.lastPublishedAt ? new Date(settings.lastPublishedAt).getTime() : 0;
          const intervalMs = (settings.frequencyHours || 24) * 60 * 60 * 1000;

          if (now - lastTime >= intervalMs) {
            console.log('[SocialScheduler] AutoPilot trigger: Generating and publishing commercial post for APM Inox...');
            const result = await AutoPilotService.publishNow();
            if (result.success) {
              console.log('[SocialScheduler] AutoPilot successfully published commercial post to Facebook:', result.post?.externalPostUrl);
              processedCount++;
            }
          }
        }
      } catch (autoErr) {
        console.warn('[SocialScheduler] AutoPilot recurring check error:', autoErr);
      }

      // 3. Process DB posts if database is configured
      if (process.env.DATABASE_URL || process.env.SQL_PASSWORD) {
        try {
          const now = new Date();
          const duePosts = await db
            .select()
            .from(socialPosts)
            .where(
              and(
                eq(socialPosts.status, 'SCHEDULED'),
                lte(socialPosts.scheduledAt, now),
                isNull(socialPosts.deletedAt)
              )
            )
            .limit(20);

          for (const post of duePosts) {
            try {
              await SocialPublisherService.publishPost(post.workspaceId, post.id);
              processedCount++;
            } catch (err) {
              console.error(`Error processing scheduled post #${post.id}:`, err);
            }
          }
        } catch (dbErr) {
          // DB offline or unconfigured
        }
      }

      return processedCount;
    } finally {
      this.isRunning = false;
    }
  }
}
