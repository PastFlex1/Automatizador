import { SocialPublisherAdapter } from './social-publisher.adapter';
import { PublishRequest, PublishResult, SocialPlatform, SocialCapabilities, PLATFORM_CAPABILITIES } from '../types';
import { validatePublicMediaUrl } from '../utils/url-validator';

export class FacebookAdapter implements SocialPublisherAdapter {
  readonly platform: SocialPlatform = 'FACEBOOK';

  getCapabilities(): SocialCapabilities {
    return PLATFORM_CAPABILITIES.FACEBOOK;
  }

  validatePost(request: PublishRequest): { isValid: boolean; error?: string } {
    if (!request.caption && (!request.mediaAssets || request.mediaAssets.length === 0)) {
      return { isValid: false, error: 'Facebook requiere texto o al menos un archivo multimedia' };
    }
    if (request.caption && request.caption.length > this.getCapabilities().maxCaptionLength) {
      return {
        isValid: false,
        error: `El texto excede el límite máximo de ${this.getCapabilities().maxCaptionLength} caracteres`,
      };
    }

    // Validate media URLs if present
    if (request.mediaAssets && request.mediaAssets.length > 0) {
      for (const asset of request.mediaAssets) {
        const urlValidation = validatePublicMediaUrl(asset.url);
        if (!urlValidation.isValid) {
          return urlValidation;
        }
      }
    }

    return { isValid: true };
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    const validation = this.validatePost(request);
    if (!validation.isValid) {
      return {
        success: false,
        errorCode: 'VALIDATION_FAILED',
        errorMessage: validation.error,
      };
    }

    try {
      const pageId = request.externalAccountId;
      const accessToken = request.accessToken;
      const graphVersion = 'v21.0';

      // 1. Photo Post
      if (request.contentType === 'IMAGE' && request.mediaAssets.length > 0) {
        const photoUrl = request.mediaAssets[0].url;
        const res = await fetch(`https://graph.facebook.com/${graphVersion}/${pageId}/photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: photoUrl,
            caption: request.caption,
            access_token: accessToken,
          }),
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          return this.handleMetaError(data.error);
        }

        const externalId = data.post_id || data.id;
        return {
          success: true,
          externalPostId: externalId,
          externalPostUrl: `https://facebook.com/${externalId}`,
          metadata: { id: data.id, postId: data.post_id },
        };
      }

      // 1.5 Story Post
      if (request.contentType === 'STORY' && request.mediaAssets.length > 0) {
        const primaryMedia = request.mediaAssets[0];
        const isVideo = primaryMedia.type === 'VIDEO';
        const endpoint = isVideo ? 'video_story_adds' : 'photo_story_adds';
        
        const payload: any = {
          access_token: accessToken,
        };
        
        if (isVideo) {
          payload.video_url = primaryMedia.url;
        } else {
          payload.photo_url = primaryMedia.url;
        }

        const res = await fetch(`https://graph.facebook.com/${graphVersion}/${pageId}/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          return this.handleMetaError(data.error);
        }

        return {
          success: true,
          externalPostId: data.id || data.post_id,
          externalPostUrl: `https://facebook.com/${data.id || data.post_id}`,
          metadata: data,
        };
      }

      // 2. Text / Feed Post
      const res = await fetch(`https://graph.facebook.com/${graphVersion}/${pageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: request.caption,
          access_token: accessToken,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        return this.handleMetaError(data.error);
      }

      return {
        success: true,
        externalPostId: data.id,
        externalPostUrl: `https://facebook.com/${data.id}`,
        metadata: data,
      };
    } catch (err: any) {
      return {
        success: false,
        errorCode: 'FB_NETWORK_ERROR',
        errorMessage: 'Error de comunicación con los servidores de Meta Graph API.',
      };
    }
  }

  private handleMetaError(error: any): PublishResult {
    const code = error?.code;
    const subcode = error?.error_subcode;
    const rawMessage = (error?.message || '').toLowerCase();

    // Token Expired / Invalid
    if (code === 190 || subcode === 463 || subcode === 467 || rawMessage.includes('session has expired') || rawMessage.includes('validate access token')) {
      return {
        success: false,
        errorCode: 'TOKEN_EXPIRED',
        errorMessage: 'El token de acceso de Facebook ha expirado o fue revocado. Vuelve a conectar tu cuenta de Meta.',
      };
    }

    // Permission Denied
    if (code === 200 || rawMessage.includes('permission') || rawMessage.includes('pages_manage_posts')) {
      return {
        success: false,
        errorCode: 'PERMISSIONS_ERROR',
        errorMessage: 'Faltan permisos de publicación (pages_manage_posts) para esta página de Facebook.',
      };
    }

    // Rate limit
    if (code === 4 || code === 17 || code === 32) {
      return {
        success: false,
        errorCode: 'RATE_LIMIT_EXCEEDED',
        errorMessage: 'Límite de peticiones de Meta alcanzado. Espera unos minutos antes de volver a publicar.',
      };
    }

    return {
      success: false,
      errorCode: code?.toString() || 'FB_PUBLISH_ERROR',
      errorMessage: error?.message || 'Error al publicar en Facebook Page.',
    };
  }
}
