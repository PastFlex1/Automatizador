import fs from 'fs';
import path from 'path';
import { dataFile } from '../../config/paths.ts';

export interface SafePublisherConfig {
  maxDailyPosts: number;
  minIntervalMinutes: number;
  maxIntervalMinutes: number;
  requireHumanConfirmation: boolean;
  autoThrottleOnRisk: boolean;
}

export interface ContentQualityCheckResult {
  passed: boolean;
  qualityScore: number; // 0 to 100
  requiresHumanReview: boolean;
  issues: string[];
  warnings: string[];
  metrics: {
    charCount: number;
    emojiCount: number;
    emojiDensityPercent: number;
    capsPercent: number;
    spamWordsDetected: string[];
  };
}

export interface AccountRiskAssessment {
  riskScore: number; // 0-30 Healthy, 31-70 Caution, 71-100 High Risk
  riskLevel: 'HEALTHY' | 'CAUTION' | 'HIGH_RISK';
  reasons: string[];
  postsTodayCount: number;
  dailyLimit: number;
  canPublishNow: boolean;
  recommendedWaitMinutes: number;
}

export interface GroupQueueItem {
  id: string;
  groupId: number | string;
  groupName: string;
  productName: string;
  price: string;
  scheduledTime: string;
  scheduledIso: string;
  title: string;
  caption: string;
  status: 'QUEUED' | 'WAITING_USER_CONFIRMATION' | 'PUBLISHED' | 'THROTTLED';
  publishedAt?: string;
  messagesReceived?: number;
}

const STORAGE_PATH = dataFile('safe-publisher-state.json');

export class SafeSocialPublisherService {
  private static defaultConfig: SafePublisherConfig = {
    maxDailyPosts: 15,
    minIntervalMinutes: 15,
    maxIntervalMinutes: 60,
    requireHumanConfirmation: true,
    autoThrottleOnRisk: true,
  };

  // Blacklist of words that trigger Facebook Marketplace or spam filters
  private static SPAM_TRIGGER_WORDS = [
    'gana dinero',
    'ingresos pasivos',
    'hazte rico',
    '100% gratis',
    'gratis gratis',
    'sin invertir',
    'trabaja desde casa',
    'cura milagrosa',
    'remedio magico',
    'baja de peso ya',
    'prestamos inmediatos',
    'dinero facil',
    'criptomoneda',
    'bitcoin',
    'piramide',
    'sorteo express',
    'sorteo gratis',
    'click aqui',
    'clic aqui',
    'urgente compre ya',
    'ultimo minuto estafa',
  ];

  private static loadState(): {
    config: SafePublisherConfig;
    queue: GroupQueueItem[];
    history: Array<{ timestamp: string; productId: string; productName: string; groupId: string | number; success: boolean }>;
  } {
    try {
      if (fs.existsSync(STORAGE_PATH)) {
        const raw = fs.readFileSync(STORAGE_PATH, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[SafeSocialPublisher] Could not read state, creating default.');
    }

    const defaultState = {
      config: this.defaultConfig,
      queue: [],
      history: [],
    };
    this.saveState(defaultState);
    return defaultState;
  }

  private static saveState(state: any): void {
    try {
      const dir = path.dirname(STORAGE_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(STORAGE_PATH, JSON.stringify(state, null, 2), 'utf-8');
    } catch (e) {
      console.error('[SafeSocialPublisher] Error saving state:', e);
    }
  }

  /**
   * 1. QUALITY CONTROL GATEKEEPER
   * Validates content against Meta spam rules before publication
   */
  static validateContentQuality(title: string, description: string): ContentQualityCheckResult {
    const combined = `${title || ''} ${description || ''}`.trim();
    const issues: string[] = [];
    const warnings: string[] = [];

    // Length check
    if (!title || title.trim().length < 5) {
      issues.push('El título es demasiado corto (mínimo 5 caracteres).');
    }
    if (!description || description.trim().length < 20) {
      issues.push('La descripción es demasiado corta para un anuncio creíble (mínimo 20 caracteres).');
    }

    // Caps Lock / Shouting check
    const letters = combined.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, '');
    let capsPercent = 0;
    if (letters.length > 0) {
      const upperCount = (letters.match(/[A-ZÁÉÍÓÚÑ]/g) || []).length;
      capsPercent = Math.round((upperCount / letters.length) * 100);
      if (capsPercent > 45) {
        issues.push(`Demasiadas mayúsculas (${capsPercent}%). Meta penaliza los textos que simulan gritos.`);
      } else if (capsPercent > 30) {
        warnings.push(`Nivel de mayúsculas moderado-alto (${capsPercent}%). Considera usar mayúsculas solo al inicio.`);
      }
    }

    // Emoji density check
    const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
    const emojis = combined.match(emojiRegex) || [];
    const emojiCount = emojis.length;
    const totalWords = combined.split(/\s+/).filter(Boolean).length || 1;
    const emojiDensityPercent = Math.round((emojiCount / totalWords) * 100);

    if (emojiCount > 12 || emojiDensityPercent > 20) {
      issues.push(`Exceso de emojis (${emojiCount} emojis, densidad ${emojiDensityPercent}%). Los algoritmos de Marketplace lo detectan como spam.`);
    } else if (emojiCount > 7) {
      warnings.push(`Densidad de emojis notable (${emojiCount} emojis). Procura usar solo 2 o 3 para destacar beneficios.`);
    }

    // Spam words check
    const lowerCombined = combined.toLowerCase();
    const spamWordsDetected: string[] = [];
    for (const phrase of this.SPAM_TRIGGER_WORDS) {
      if (lowerCombined.includes(phrase)) {
        spamWordsDetected.push(phrase);
      }
    }

    if (spamWordsDetected.length > 0) {
      issues.push(`Palabras detectadas de alto riesgo de baneo: "${spamWordsDetected.join('", "')}".`);
    }

    // Duplicated consecutive exclamation or question marks
    if (/[!?]{3,}/.test(combined)) {
      warnings.push('Signos de exclamación/interrogación repetidos excesivos (ej: !!!).');
    }

    // Final Score Calculation
    let qualityScore = 100;
    qualityScore -= issues.length * 25;
    qualityScore -= warnings.length * 8;
    if (qualityScore < 0) qualityScore = 0;

    const requiresHumanReview = issues.length > 0 || qualityScore < 70;

    return {
      passed: issues.length === 0,
      qualityScore,
      requiresHumanReview,
      issues,
      warnings,
      metrics: {
        charCount: combined.length,
        emojiCount,
        emojiDensityPercent,
        capsPercent,
        spamWordsDetected,
      },
    };
  }

  /**
   * 2. RISK SCORE DETECTOR
   * Calculates account health: 0-30 Healthy, 31-70 Caution, 71-100 High Risk
   */
  static assessAccountRisk(): AccountRiskAssessment {
    const state = this.loadState();
    const config = state.config || this.defaultConfig;
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // Filter publications in last 24h
    const recentPosts = (state.history || []).filter((h) => {
      return new Date(h.timestamp).getTime() > oneDayAgo;
    });

    const postsTodayCount = recentPosts.length;
    let riskScore = 10; // Baseline good standing
    const reasons: string[] = [];

    // Factor 1: Post frequency in 24 hours
    const dailyQuotaUsage = postsTodayCount / config.maxDailyPosts;
    if (postsTodayCount >= config.maxDailyPosts) {
      riskScore += 50;
      reasons.push(`Límite diario alcanzado (${postsTodayCount}/${config.maxDailyPosts} publicaciones). Publicar más hoy pondría en riesgo la cuenta.`);
    } else if (dailyQuotaUsage > 0.75) {
      riskScore += 25;
      reasons.push(`Cerca del límite diario recomendado (${postsTodayCount}/${config.maxDailyPosts}).`);
    }

    // Factor 2: Burst activity (too many posts in the last 2 hours)
    const twoHoursAgo = now - 2 * 60 * 60 * 1000;
    const postsLast2h = recentPosts.filter((p) => new Date(p.timestamp).getTime() > twoHoursAgo);
    if (postsLast2h.length >= 4) {
      riskScore += 30;
      reasons.push(`Demasiadas publicaciones consecutivas (${postsLast2h.length} en 2 horas). Riesgo de detección como bot.`);
    } else if (postsLast2h.length >= 2) {
      riskScore += 10;
    }

    // Factor 3: Failed publications or errors
    const failedPosts = recentPosts.filter((p) => !p.success);
    if (failedPosts.length > 0) {
      riskScore += failedPosts.length * 15;
      reasons.push(`${failedPosts.length} intento(s) fallido(s) registrado(s) en 24h.`);
    }

    if (riskScore > 100) riskScore = 100;

    let riskLevel: 'HEALTHY' | 'CAUTION' | 'HIGH_RISK' = 'HEALTHY';
    if (riskScore > 70) {
      riskLevel = 'HIGH_RISK';
    } else if (riskScore > 30) {
      riskLevel = 'CAUTION';
    }

    if (reasons.length === 0) {
      reasons.push('Frecuencia de publicación natural y espaciada.', 'Sin advertencias ni penalizaciones detectadas.');
    }

    const canPublishNow = riskLevel !== 'HIGH_RISK' && postsTodayCount < config.maxDailyPosts;

    // Calculate natural human wait time if throttled
    let recommendedWaitMinutes = 0;
    if (!canPublishNow) {
      recommendedWaitMinutes = 60 + Math.floor(Math.random() * 30); // 60-90 min wait
    } else if (riskLevel === 'CAUTION') {
      recommendedWaitMinutes = 35 + Math.floor(Math.random() * 20); // 35-55 min wait
    } else {
      recommendedWaitMinutes = config.minIntervalMinutes + Math.floor(Math.random() * 15);
    }

    return {
      riskScore,
      riskLevel,
      reasons,
      postsTodayCount,
      dailyLimit: config.maxDailyPosts,
      canPublishNow,
      recommendedWaitMinutes,
    };
  }

  /**
   * 3. HUMAN TIMETABLE & GROUP QUEUE GENERATOR
   * Generates realistic random intervals (15-60 min) with minute jitter e.g. 10:07, 10:43, 11:26
   */
  static generateHumanQueue(
    groups: Array<{ id: string | number; name: string }>,
    productName: string,
    price: string,
    variations: Array<{ titulo: string; descripcion: string }>
  ): GroupQueueItem[] {
    const queue: GroupQueueItem[] = [];
    let cumulativeDelayMs = 0;

    // Start with a small natural delay (e.g. 2-5 minutes from now)
    cumulativeDelayMs += (2 + Math.floor(Math.random() * 4)) * 60 * 1000;

    groups.forEach((group, index) => {
      // Pick a unique variation for each group to avoid duplicate content bungees
      const varIndex = index % variations.length;
      const variation = variations[varIndex] || {
        titulo: `${productName} - Precio de Fábrica`,
        descripcion: `Acero inoxidable con garantía. Escríbenos para confirmar disponibilidad.`,
      };

      const scheduledDate = new Date(Date.now() + cumulativeDelayMs);
      const hours = scheduledDate.getHours().toString().padStart(2, '0');
      const minutes = scheduledDate.getMinutes().toString().padStart(2, '0');
      const timeStr = `${hours}:${minutes}`;

      queue.push({
        id: `queue-${Date.now()}-${index}`,
        groupId: group.id,
        groupName: group.name,
        productName,
        price,
        scheduledTime: timeStr,
        scheduledIso: scheduledDate.toISOString(),
        title: variation.titulo,
        caption: variation.descripcion,
        status: 'QUEUED',
      });

      // Human Interval: 18 to 48 minutes random jitter
      const nextIntervalMinutes = 18 + Math.floor(Math.random() * 30);
      cumulativeDelayMs += nextIntervalMinutes * 60 * 1000;
    });

    const state = this.loadState();
    state.queue = queue;
    this.saveState(state);

    return queue;
  }

  /**
   * 4. PRODUCT ROTATION ENGINE
   * Respects 30% Prod A, 25% Prod B, 20% Prod C, 25% Others distribution
   */
  static getRecommendedProductRotation(catalog: any[]): {
    recommendedProduct: any;
    distribution: Record<string, { targetPct: number; currentCount: number }>;
  } {
    const state = this.loadState();
    const history = state.history || [];

    const prodA = catalog[0]?.name || 'Cocina Industrial 2 Quemadores';
    const prodB = catalog[1]?.name || 'Cocina 3 Quemadores c/ Plancha';
    const prodC = catalog[2]?.name || 'Mesa de Trabajo Sanitaria';

    const distribution: Record<string, { targetPct: number; currentCount: number }> = {
      [prodA]: { targetPct: 30, currentCount: 0 },
      [prodB]: { targetPct: 25, currentCount: 0 },
      [prodC]: { targetPct: 20, currentCount: 0 },
      Otros: { targetPct: 25, currentCount: 0 },
    };

    history.forEach((h) => {
      if (distribution[h.productName]) {
        distribution[h.productName].currentCount++;
      } else {
        distribution['Otros'].currentCount++;
      }
    });

    // Roulette selection based on target gap
    let selected = catalog[0];
    const rand = Math.random() * 100;
    if (rand < 30) {
      selected = catalog[0] || selected;
    } else if (rand < 55) {
      selected = catalog[1] || selected;
    } else if (rand < 75) {
      selected = catalog[2] || selected;
    } else {
      selected = catalog[Math.floor(Math.random() * catalog.length)] || selected;
    }

    return {
      recommendedProduct: selected,
      distribution,
    };
  }

  /**
   * 5. LOG AUDIT EVENT
   */
  static recordPublicationEvent(event: {
    productId: string;
    productName: string;
    groupId: string | number;
    success: boolean;
  }) {
    const state = this.loadState();
    state.history = state.history || [];
    state.history.push({
      timestamp: new Date().toISOString(),
      ...event,
    });
    // Keep max 200 history logs
    if (state.history.length > 200) {
      state.history = state.history.slice(-200);
    }
    this.saveState(state);
  }

  static getQueue(): GroupQueueItem[] {
    const state = this.loadState();
    return state.queue || [];
  }

  static clearQueue(): void {
    const state = this.loadState();
    state.queue = [];
    this.saveState(state);
  }

  static getConfig(): SafePublisherConfig {
    const state = this.loadState();
    return state.config || this.defaultConfig;
  }

  static updateConfig(newConfig: Partial<SafePublisherConfig>): SafePublisherConfig {
    const state = this.loadState();
    state.config = { ...this.defaultConfig, ...(state.config || {}), ...newConfig };
    this.saveState(state);
    return state.config;
  }
}
