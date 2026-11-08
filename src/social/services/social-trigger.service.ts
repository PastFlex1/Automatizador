import { db } from '../../db';
import { socialTriggers, products } from '../../db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';

export interface CreateSocialTriggerDto {
  socialPostId?: number;
  type?: 'COMMENT_KEYWORD' | 'DM_KEYWORD';
  keywords: string[];
  productId?: string;
  action?: 'CREATE_LEAD';
  active?: boolean;
}

export interface TriggerMatchResult {
  matched: boolean;
  triggerId?: number;
  matchedKeyword?: string;
  productId?: string | null;
  action?: string;
}

export class SocialTriggerService {
  /**
   * Default commercial intent keywords for Spanish-speaking buyers
   */
  public static readonly DEFAULT_INTENT_KEYWORDS: string[] = [
    'INFO',
    'INFORMACION',
    'INFORMACIÓN',
    'PRECIO',
    'COTIZAR',
    'COTIZACIÓN',
    'COTIZACION',
    'QUIERO',
    'ME INTERESA',
    'COSTO',
    'VALOR',
    'CATALOGO',
    'CATÁLOGO',
    'COMPRAR',
    'DISPONIBLE',
    'DETALLES',
    'PROMO',
  ];

  /**
   * Normalize text for robust deterministic matching:
   * 1. Lowercase
   * 2. Strip diacritics / accents (NFD normalization)
   * 3. Replace punctuation and special characters with spaces
   * 4. Collapse whitespace
   */
  static normalizeText(text: string): string {
    if (!text) return '';
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove accent marks
      .replace(/[^\w\s]/g, ' ') // replace punctuation with whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Evaluates whether a given text matches any of the provided keywords
   */
  static matchKeywordList(text: string, keywords: string[]): { matched: boolean; matchedKeyword?: string } {
    const normalizedContent = this.normalizeText(text);
    if (!normalizedContent) return { matched: false };

    const words = normalizedContent.split(' ');

    for (const kw of keywords) {
      const normalizedKw = this.normalizeText(kw);
      if (!normalizedKw) continue;

      // Multi-word keyword (e.g. "me interesa", "mas info")
      if (normalizedKw.includes(' ')) {
        if (normalizedContent.includes(normalizedKw)) {
          return { matched: true, matchedKeyword: kw };
        }
      } else {
        // Single word: check exact token match or substring match
        if (words.includes(normalizedKw) || normalizedContent.includes(normalizedKw)) {
          return { matched: true, matchedKeyword: kw };
        }
      }
    }

    return { matched: false };
  }

  /**
   * Evaluate content against specific triggers for a post, falling back to default workspace rules
   */
  static async evaluateTriggers(
    workspaceId: number,
    postId: number | undefined,
    content: string
  ): Promise<TriggerMatchResult> {
    // 1. Fetch specific triggers attached to this social post
    if (postId) {
      const postTriggers = await db
        .select()
        .from(socialTriggers)
        .where(
          and(
            eq(socialTriggers.workspaceId, workspaceId),
            eq(socialTriggers.socialPostId, postId),
            eq(socialTriggers.active, true)
          )
        );

      for (const trigger of postTriggers) {
        const keywords = Array.isArray(trigger.keywords) ? trigger.keywords : [];
        const result = this.matchKeywordList(content, keywords);
        if (result.matched) {
          return {
            matched: true,
            triggerId: trigger.id,
            matchedKeyword: result.matchedKeyword,
            productId: trigger.productId,
            action: trigger.action,
          };
        }
      }
    }

    // 2. Fetch global workspace triggers (triggers with no socialPostId)
    const globalTriggers = await db
      .select()
      .from(socialTriggers)
      .where(
        and(
          eq(socialTriggers.workspaceId, workspaceId),
          isNull(socialTriggers.socialPostId),
          eq(socialTriggers.active, true)
        )
      );

    for (const trigger of globalTriggers) {
      const keywords = Array.isArray(trigger.keywords) ? trigger.keywords : [];
      const result = this.matchKeywordList(content, keywords);
      if (result.matched) {
        return {
          matched: true,
          triggerId: trigger.id,
          matchedKeyword: result.matchedKeyword,
          productId: trigger.productId,
          action: trigger.action,
        };
      }
    }

    // 3. Fallback: evaluate against default built-in intent keywords
    const defaultMatch = this.matchKeywordList(content, this.DEFAULT_INTENT_KEYWORDS);
    if (defaultMatch.matched) {
      return {
        matched: true,
        matchedKeyword: defaultMatch.matchedKeyword,
        action: 'CREATE_LEAD',
      };
    }

    return { matched: false };
  }

  /**
   * CRUD: Get all triggers for a workspace
   */
  static async getTriggers(workspaceId: number, postId?: number) {
    const conditions = [eq(socialTriggers.workspaceId, workspaceId)];
    if (postId !== undefined) {
      conditions.push(eq(socialTriggers.socialPostId, postId));
    }

    return db
      .select()
      .from(socialTriggers)
      .where(and(...conditions))
      .orderBy(desc(socialTriggers.createdAt));
  }

  /**
   * CRUD: Create a new trigger
   */
  static async createTrigger(workspaceId: number, dto: CreateSocialTriggerDto) {
    const cleanedKeywords = (dto.keywords || [])
      .map((k) => k.trim().toUpperCase())
      .filter((k) => k.length > 0);

    const [trigger] = await db
      .insert(socialTriggers)
      .values({
        workspaceId,
        socialPostId: dto.socialPostId || null,
        type: dto.type || 'COMMENT_KEYWORD',
        keywords: cleanedKeywords,
        productId: dto.productId || null,
        action: dto.action || 'CREATE_LEAD',
        active: dto.active !== undefined ? dto.active : true,
      })
      .returning();

    return trigger;
  }

  /**
   * CRUD: Update a trigger
   */
  static async updateTrigger(
    workspaceId: number,
    triggerId: number,
    dto: Partial<CreateSocialTriggerDto>
  ) {
    const updatePayload: Partial<typeof socialTriggers.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (dto.keywords !== undefined) {
      updatePayload.keywords = dto.keywords
        .map((k) => k.trim().toUpperCase())
        .filter((k) => k.length > 0);
    }
    if (dto.productId !== undefined) updatePayload.productId = dto.productId || null;
    if (dto.active !== undefined) updatePayload.active = dto.active;
    if (dto.action !== undefined) updatePayload.action = dto.action;

    const [updated] = await db
      .update(socialTriggers)
      .set(updatePayload)
      .where(and(eq(socialTriggers.id, triggerId), eq(socialTriggers.workspaceId, workspaceId)))
      .returning();

    return updated;
  }

  /**
   * CRUD: Delete a trigger
   */
  static async deleteTrigger(workspaceId: number, triggerId: number) {
    const [deleted] = await db
      .delete(socialTriggers)
      .where(and(eq(socialTriggers.id, triggerId), eq(socialTriggers.workspaceId, workspaceId)))
      .returning();

    return !!deleted;
  }
}
