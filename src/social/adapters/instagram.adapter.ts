import { SocialPublisherAdapter } from './social-publisher.adapter';
import { PublishRequest, PublishResult, SocialPlatform, SocialCapabilities, PLATFORM_CAPABILITIES } from '../types';
import { validatePublicMediaUrl } from '../utils/url-validator';

export class InstagramAdapter implements SocialPublisherAdapter {
  readonly platform: SocialPlatform = 'INSTAGRAM';

  getCapabilities(): SocialCapabilities {
    return PLATFORM_CAPABILITIES.INSTAGRAM;
  }

  validatePost(request: PublishRequest): { isValid: boolean; error?: string } {
    if (!request.mediaAssets || request.mediaAssets.length === 0) {
      return { isValid: false, error: 'Instagram requiere al menos una imagen o video para publicar' };
    }
    if (request.caption && request.caption.length > this.getCapabilities().maxCaptionLength) {
      return {
        isValid: false,
        error: `El caption excede el límite máximo de ${this.getCapabilities().maxCaptionLength} caracteres de Instagram`,
      };
    }

    // Validate media URLs
    for (const asset of request.mediaAssets) {
      const urlValidation = validatePublicMediaUrl(asset.url);
      if (!urlValidation.isValid) {
        return urlValidation;
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
      const igUserId = request.externalAccountId;
      const accessToken = request.accessToken;
      const graphVersion = 'v21.0';
      const primaryMedia = request.mediaAssets[0];

      // Paso 1: Crear Contenedor de Medios (Media Container)
      const containerBody: Record<string, any> = {
        caption: request.caption || '',
        access_token: accessToken,
        image_url: primaryMedia.url,
      };

      const isVideo = primaryMedia.type === 'VIDEO' || request.contentType === 'VIDEO' || request.contentType === 'REEL';
      if (request.contentType === 'STORY') {
        containerBody.media_type = 'STORIES';
        if (primaryMedia.type === 'VIDEO') {
          containerBody.video_url = primaryMedia.url;
          delete containerBody.image_url;
        }
      } else if (isVideo) {
        containerBody.media_type = request.contentType === 'REEL' ? 'REELS' : 'VIDEO';
        containerBody.video_url = primaryMedia.url;
        delete containerBody.image_url;
      }

      const containerRes = await fetch(`https://graph.facebook.com/${graphVersion}/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(containerBody),
      });

      const containerData = await containerRes.json();
      if (!containerRes.ok || containerData.error) {
        return this.handleMetaError(containerData.error, 'IG_CONTAINER_ERROR');
      }

      const creationId = containerData.id;
      if (!creationId) {
        return {
          success: false,
          errorCode: 'IG_CONTAINER_ERROR',
          errorMessage: 'No se recibió identificador de contenedor de Instagram.',
        };
      }

      // Paso 2: Si es video, esperar estado FINISHED
      if (isVideo) {
        let isReady = false;
        let attempts = 0;
        while (!isReady && attempts < 5) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          attempts++;
          const statusRes = await fetch(
            `https://graph.facebook.com/${graphVersion}/${creationId}?fields=status_code&access_token=${accessToken}`
          );
          const statusData = await statusRes.json();
          if (statusData.status_code === 'FINISHED') {
            isReady = true;
          } else if (statusData.status_code === 'ERROR') {
            return {
              success: false,
              errorCode: 'IG_PROCESSING_FAILED',
              errorMessage: 'El procesamiento del archivo multimedia falló en los servidores de Instagram.',
            };
          }
        }
      }

      // Paso 3: Publicar el Contenedor (Media Publish)
      const publishRes = await fetch(`https://graph.facebook.com/${graphVersion}/${igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: creationId,
          access_token: accessToken,
        }),
      });

      const publishData = await publishRes.json();
      if (!publishRes.ok || publishData.error) {
        return this.handleMetaError(publishData.error, 'IG_PUBLISH_ERROR');
      }

      const externalPostId = publishData.id;

      // Paso 4: Obtener permalink público oficial si está disponible
      let externalPostUrl: string | undefined = undefined;
      try {
        const permalinkRes = await fetch(
          `https://graph.facebook.com/${graphVersion}/${externalPostId}?fields=permalink&access_token=${accessToken}`
        );
        const permalinkData = await permalinkRes.json();
        if (permalinkData.permalink) {
          externalPostUrl = permalinkData.permalink;
        }
      } catch {
        // Non-blocking fallback
      }

      return {
        success: true,
        externalPostId,
        externalPostUrl,
        metadata: { creationId, igMediaId: externalPostId },
      };
    } catch (err: any) {
      return {
        success: false,
        errorCode: 'IG_NETWORK_ERROR',
        errorMessage: 'Error de comunicación con los servidores de Instagram Graph API.',
      };
    }
  }

  private handleMetaError(error: any, fallbackCode: string): PublishResult {
    const code = error?.code;
    const subcode = error?.error_subcode;
    const rawMessage = (error?.message || '').toLowerCase();

    // Token Expired / Invalid
    if (code === 190 || subcode === 463 || subcode === 467 || rawMessage.includes('session has expired') || rawMessage.includes('validate access token')) {
      return {
        success: false,
        errorCode: 'TOKEN_EXPIRED',
        errorMessage: 'El token de acceso de Instagram ha expirado o fue revocado. Vuelve a conectar tu cuenta de Meta.',
      };
    }

    // Media URL inaccessible
    if (code === 10 || subcode === 2207027 || rawMessage.includes('media url') || rawMessage.includes('download')) {
      return {
        success: false,
        errorCode: 'MEDIA_URL_INACCESSIBLE',
        errorMessage: 'Instagram no pudo descargar la imagen desde la URL proporcionada. Asegúrate de que sea una URL pública accesible.',
      };
    }

    // Aspect ratio error
    if (subcode === 2207001 || rawMessage.includes('aspect ratio')) {
      return {
        success: false,
        errorCode: 'INVALID_ASPECT_RATIO',
        errorMessage: 'La relación de aspecto de la imagen no es compatible con Instagram (debe estar entre 4:5 y 1.91:1).',
      };
    }

    // Permission Denied
    if (code === 200 || code === 10 || rawMessage.includes('permission') || rawMessage.includes('instagram_content_publish')) {
      return {
        success: false,
        errorCode: 'PERMISSIONS_ERROR',
        errorMessage: 'Faltan permisos de publicación (instagram_content_publish) para esta cuenta comercial de Instagram.',
      };
    }

    return {
      success: false,
      errorCode: code?.toString() || fallbackCode,
      errorMessage: error?.message || 'Error al publicar en Instagram Professional.',
    };
  }
}
