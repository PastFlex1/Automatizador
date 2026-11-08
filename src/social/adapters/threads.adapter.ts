import { SocialPublisherAdapter } from './social-publisher.adapter';
import { PublishRequest, PublishResult, SocialPlatform, SocialCapabilities, PLATFORM_CAPABILITIES } from '../types';

export class ThreadsAdapter implements SocialPublisherAdapter {
  readonly platform: SocialPlatform = 'THREADS';

  getCapabilities(): SocialCapabilities {
    return PLATFORM_CAPABILITIES.THREADS;
  }

  validatePost(request: PublishRequest): { isValid: boolean; error?: string } {
    if (!request.caption) {
      return { isValid: false, error: 'Threads requiere texto (máx. 500 caracteres)' };
    }
    if (request.caption.length > this.getCapabilities().maxCaptionLength) {
      return { isValid: false, error: `El texto excede el límite de ${this.getCapabilities().maxCaptionLength} caracteres en Threads` };
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
      const threadsUserId = request.externalAccountId;
      const accessToken = request.accessToken;
      const primaryMedia = request.mediaAssets && request.mediaAssets.length > 0 ? request.mediaAssets[0] : null;

      // Paso 1: Crear Contenedor en Threads
      const containerBody: Record<string, any> = {
        text: request.caption,
        access_token: accessToken,
      };

      if (primaryMedia) {
        if (primaryMedia.type === 'VIDEO') {
          containerBody.media_type = 'VIDEO';
          containerBody.video_url = primaryMedia.url;
        } else {
          containerBody.media_type = 'IMAGE';
          containerBody.image_url = primaryMedia.url;
        }
      } else {
        containerBody.media_type = 'TEXT';
      }

      const containerRes = await fetch(`https://graph.threads.net/v1.0/${threadsUserId}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(containerBody),
      });

      const containerData = await containerRes.json();
      if (!containerRes.ok || containerData.error) {
        return {
          success: false,
          errorCode: containerData.error?.code?.toString() || 'THREADS_CONTAINER_ERROR',
          errorMessage: containerData.error?.message || 'Error al crear contenedor en Threads',
        };
      }

      const creationId = containerData.id;

      // Paso 2: Publicar el Contenedor
      const publishRes = await fetch(`https://graph.threads.net/v1.0/${threadsUserId}/threads_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: creationId,
          access_token: accessToken,
        }),
      });

      const publishData = await publishRes.json();
      if (!publishRes.ok || publishData.error) {
        return {
          success: false,
          errorCode: publishData.error?.code?.toString() || 'THREADS_PUBLISH_ERROR',
          errorMessage: publishData.error?.message || 'Error al publicar post en Threads',
        };
      }

      return {
        success: true,
        externalPostId: publishData.id,
        externalPostUrl: `https://threads.net/post/${publishData.id}`,
        metadata: publishData,
      };
    } catch (err: any) {
      return {
        success: false,
        errorCode: 'NETWORK_EXCEPTION',
        errorMessage: err.message || 'Excepción al conectar con Threads API',
      };
    }
  }
}
