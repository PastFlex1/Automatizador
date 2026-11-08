import crypto from 'crypto';
import { SocialAccountService } from '../../social/services/social-account.service';

export interface MetaConnectedAccountDiscovery {
  platform: 'FACEBOOK' | 'INSTAGRAM' | 'THREADS';
  externalAccountId: string;
  name: string;
  username?: string;
  profilePictureUrl?: string;
  accessToken: string;
  expiresInSeconds?: number;
  metadata?: Record<string, any>;
}

export interface SanitizedDiscoveredAccount {
  externalAccountId: string;
  platform: 'FACEBOOK' | 'INSTAGRAM' | 'THREADS';
  name: string;
  username?: string;
  profilePictureUrl?: string;
  category?: string;
}

export interface DiscoverySession {
  workspaceId: number;
  accounts: MetaConnectedAccountDiscovery[];
  expiresAt: number;
}

export interface OAuthErrorDiagnosis {
  code: string;
  message: string;
  recommendation: string;
}

export class MetaOAuthService {
  // In-memory anti-CSRF state storage with TTL and single-use guarantee
  private static pendingStates = new Map<
    string,
    { workspaceId: number; createdAt: number; expiresAt: number }
  >();

  // In-memory discovery sessions holding tokens temporarily until user chooses which accounts to connect
  private static discoverySessions = new Map<string, DiscoverySession>();

  static getMetaAppCredentials() {
    return {
      appId: process.env.META_APP_ID || '',
      appSecret: process.env.META_APP_SECRET || '',
      redirectUri:
        process.env.META_REDIRECT_URI ||
        `${process.env.APP_URL || 'http://localhost:3000'}/api/social/meta/callback`,
    };
  }

  /**
   * Generates a cryptographically random anti-CSRF state and official Meta OAuth URL
   */
  static generateAuthUrl(workspaceId: number): { url: string; state: string } {
    const { appId, redirectUri } = this.getMetaAppCredentials();
    const state = crypto.randomBytes(32).toString('hex');

    // Clean up expired states
    const now = Date.now();
    for (const [key, value] of this.pendingStates.entries()) {
      if (now > value.expiresAt) {
        this.pendingStates.delete(key);
      }
    }

    // Store state for 15 minutes
    this.pendingStates.set(state, {
      workspaceId,
      createdAt: now,
      expiresAt: now + 15 * 60 * 1000,
    });

    // Official Meta Graph API v21.0 Scopes required for Facebook Pages and Instagram Business
    const scopes = [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'instagram_basic',
      'instagram_content_publish',
      'business_management',
    ].join(',');

    const url = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${encodeURIComponent(
      appId
    )}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&state=${state}&scope=${encodeURIComponent(scopes)}&response_type=code`;

    return { url, state };
  }

  /**
   * Validates state anti-CSRF and immediately invalidates it to prevent replay attacks
   */
  static validateState(state: string): { isValid: boolean; workspaceId?: number } {
    if (!state || typeof state !== 'string') {
      return { isValid: false };
    }

    const stored = this.pendingStates.get(state);
    if (!stored) {
      return { isValid: false };
    }

    // Invalidate immediately (single-use guarantee)
    this.pendingStates.delete(state);

    if (Date.now() > stored.expiresAt) {
      return { isValid: false };
    }

    return { isValid: true, workspaceId: stored.workspaceId };
  }

  /**
   * Diagnoses Meta OAuth errors into clear, actionable, user-friendly explanations
   */
  static diagnoseOAuthError(
    errorCode?: string,
    errorReason?: string,
    errorDescription?: string
  ): OAuthErrorDiagnosis {
    const raw = `${errorCode || ''} ${errorReason || ''} ${errorDescription || ''}`.toLowerCase();

    if (raw.includes('redirect_uri') || raw.includes('mismatch')) {
      return {
        code: 'REDIRECT_URI_MISMATCH',
        message: 'La URL de redirección no coincide con la configurada en Meta for Developers.',
        recommendation:
          'Verifica que META_REDIRECT_URI en tu archivo .env esté añadida en "Configuración de inicio de sesión con Facebook" > "URI de redireccionamiento de OAuth válidos".',
      };
    }

    if (raw.includes('invalid_client') || raw.includes('app_id') || raw.includes('client_id')) {
      return {
        code: 'INVALID_CLIENT',
        message: 'Las credenciales de la aplicación de Meta (App ID o App Secret) son inválidas.',
        recommendation:
          'Verifica en Meta for Developers que META_APP_ID y META_APP_SECRET correspondan a una App activa.',
      };
    }

    if (raw.includes('access_denied') || raw.includes('user_denied') || raw.includes('denied')) {
      return {
        code: 'ACCESS_DENIED',
        message: 'El usuario rechazó o canceló la solicitud de permisos en Meta.',
        recommendation:
          'Para conectar tu cuenta, debes aceptar los permisos solicitados en la ventana de Meta.',
      };
    }

    if (raw.includes('invalid_scope') || raw.includes('permission')) {
      return {
        code: 'INVALID_SCOPE',
        message: 'Uno o más permisos solicitados no están disponibles para tu App de Meta.',
        recommendation:
          'Comprueba en Meta for Developers > Casos de uso / Permisos que tu App tenga activados los permisos solicitados.',
      };
    }

    if (raw.includes('app not active') || raw.includes('development mode') || raw.includes('inactiva')) {
      return {
        code: 'APP_NOT_ACTIVE',
        message: 'La aplicación de Meta está en modo Desarrollo y la cuenta no tiene rol de tester/admin.',
        recommendation:
          'Añade tu cuenta de Facebook como Administrador o Evaluador (Tester) en el panel de Meta for Developers.',
      };
    }

    return {
      code: errorCode || 'META_OAUTH_ERROR',
      message: errorDescription || 'Ocurrió un error al procesar la autorización con Meta.',
      recommendation:
        'Intenta conectar nuevamente o revisa los registros del servidor para más detalles.',
    };
  }

  /**
   * Server-side exchange of authorization code for user token and long-lived page tokens
   * NEVER exposes META_APP_SECRET or access tokens to the browser.
   */
  static async exchangeCodeForAccounts(
    code: string,
    redirectUriOverride?: string
  ): Promise<MetaConnectedAccountDiscovery[]> {
    const { appId, appSecret, redirectUri } = this.getMetaAppCredentials();
    const effectiveRedirectUri = redirectUriOverride || redirectUri;

    if (!appId || !appSecret) {
      throw new Error('META_APP_ID y META_APP_SECRET deben estar configurados en el entorno.');
    }

    // 1. Obtener User Access Token (Short-lived)
    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${encodeURIComponent(
      appId
    )}&redirect_uri=${encodeURIComponent(
      effectiveRedirectUri
    )}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`;

    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      const errorMsg = tokenData.error?.message || 'Error al intercambiar código con Meta OAuth';
      throw new Error(errorMsg);
    }

    const shortLivedToken = tokenData.access_token;
    if (!shortLivedToken) {
      throw new Error('No se recibió access_token en la respuesta de Meta OAuth');
    }

    // 2. Intercambiar por Long-Lived Token (60 días)
    const longTokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(
      appId
    )}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(
      shortLivedToken
    )}`;

    let userAccessToken = shortLivedToken;
    try {
      const longTokenRes = await fetch(longTokenUrl);
      const longTokenData = await longTokenRes.json();
      if (!longTokenRes.ok || longTokenData.error) {
        console.error('[MetaOAuth] Error al intercambiar por token de larga duración:', longTokenData.error);
      } else if (longTokenData.access_token) {
        userAccessToken = longTokenData.access_token;
      }
    } catch (err) {
      console.error('[MetaOAuth] Excepción al intercambiar por token de larga duración:', err);
    }

    // 3. Descubrir Facebook Pages y cuentas de Instagram vinculadas
    const accountsUrl = `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,category,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}&access_token=${encodeURIComponent(
      userAccessToken
    )}`;

    const accountsRes = await fetch(accountsUrl);
    const accountsData = await accountsRes.json();

    if (!accountsRes.ok || accountsData.error) {
      const errorMsg = accountsData.error?.message || 'Error al obtener páginas de Facebook del usuario';
      throw new Error(errorMsg);
    }

    const discovered: MetaConnectedAccountDiscovery[] = [];

    if (accountsData.data && Array.isArray(accountsData.data)) {
      for (const page of accountsData.data) {
        // Facebook Page
        discovered.push({
          platform: 'FACEBOOK',
          externalAccountId: page.id,
          name: page.name,
          profilePictureUrl: page.picture?.data?.url,
          accessToken: page.access_token,
          expiresInSeconds: 60 * 24 * 3600,
          metadata: { pageId: page.id, pageName: page.name, category: page.category },
        });

        // Instagram Business Account vinculada
        if (page.instagram_business_account) {
          const ig = page.instagram_business_account;
          discovered.push({
            platform: 'INSTAGRAM',
            externalAccountId: ig.id,
            name: ig.name || ig.username || `${page.name} Instagram`,
            username: ig.username,
            profilePictureUrl: ig.profile_picture_url,
            accessToken: page.access_token, // El token de página con permisos de Instagram administra la cuenta
            expiresInSeconds: 60 * 24 * 3600,
            metadata: { pageId: page.id, instagramId: ig.id },
          });
        }
      }
    }

    return discovered;
  }

  /**
   * Creates an ephemeral discovery session holding discovered accounts for user selection
   */
  static createDiscoverySession(
    workspaceId: number,
    accounts: MetaConnectedAccountDiscovery[]
  ): string {
    const discoveryId = crypto.randomBytes(24).toString('hex');
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Clean up old sessions
    const now = Date.now();
    for (const [id, sess] of this.discoverySessions.entries()) {
      if (now > sess.expiresAt) {
        this.discoverySessions.delete(id);
      }
    }

    this.discoverySessions.set(discoveryId, {
      workspaceId,
      accounts,
      expiresAt,
    });

    return discoveryId;
  }

  /**
   * Retrieves sanitized list of discovered accounts without exposing tokens
   */
  static getDiscoveredAccounts(discoveryId: string): {
    workspaceId: number;
    accounts: SanitizedDiscoveredAccount[];
  } | null {
    const session = this.discoverySessions.get(discoveryId);
    if (!session || Date.now() > session.expiresAt) {
      if (session) this.discoverySessions.delete(discoveryId);
      return null;
    }

    const sanitized: SanitizedDiscoveredAccount[] = session.accounts.map((acc) => ({
      externalAccountId: acc.externalAccountId,
      platform: acc.platform,
      name: acc.name,
      username: acc.username,
      profilePictureUrl: acc.profilePictureUrl,
      category: acc.metadata?.category,
    }));

    return {
      workspaceId: session.workspaceId,
      accounts: sanitized,
    };
  }

  /**
   * Connects selected accounts into the database with AES-256-GCM encryption
   */
  static async connectSelectedAccounts(
    workspaceId: number,
    discoveryId: string,
    selectedAccountIds: string[]
  ) {
    const session = this.discoverySessions.get(discoveryId);
    if (!session || Date.now() > session.expiresAt) {
      if (session) this.discoverySessions.delete(discoveryId);
      throw new Error('La sesión de descubrimiento de cuentas ha expirado. Inicia el flujo nuevamente.');
    }

    if (session.workspaceId !== workspaceId) {
      throw new Error('Violación de seguridad: El workspace no coincide con la sesión OAuth.');
    }

    const selectedSet = new Set(selectedAccountIds);
    const accountsToConnect = session.accounts.filter((acc) =>
      selectedSet.has(acc.externalAccountId)
    );

    if (accountsToConnect.length === 0) {
      throw new Error('No se seleccionó ninguna cuenta válida para conectar.');
    }

    const connectedResults = [];

    for (const acc of accountsToConnect) {
      const connected = await SocialAccountService.connectAccount({
        workspaceId,
        platform: acc.platform,
        externalAccountId: acc.externalAccountId,
        name: acc.name,
        username: acc.username,
        profilePictureUrl: acc.profilePictureUrl,
        accessToken: acc.accessToken,
        expiresInSeconds: acc.expiresInSeconds,
        metadata: acc.metadata,
      });
      connectedResults.push(connected);
    }

    // Clean up discovery session after successful connection
    this.discoverySessions.delete(discoveryId);

    return connectedResults;
  }
}
