import { SocialPublisherAdapter } from './social-publisher.adapter';
import { PublishRequest, PublishResult, SocialPlatform, SocialCapabilities, PLATFORM_CAPABILITIES } from '../types';

export class MockSocialAdapter implements SocialPublisherAdapter {
  constructor(public readonly platform: SocialPlatform) {}

  getCapabilities(): SocialCapabilities {
    return PLATFORM_CAPABILITIES[this.platform] || PLATFORM_CAPABILITIES.FACEBOOK;
  }

  validatePost(request: PublishRequest): { isValid: boolean; error?: string } {
    if (this.platform === 'INSTAGRAM' && (!request.mediaAssets || request.mediaAssets.length === 0)) {
      return { isValid: false, error: 'Instagram requiere al menos una imagen o video' };
    }
    if (this.platform === 'THREADS' && request.caption && request.caption.length > 500) {
      return { isValid: false, error: 'Threads no permite más de 500 caracteres' };
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

    // Generate realistic mock ID and public permalink
    const mockId = `mock_${this.platform.toLowerCase()}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const urls: Record<SocialPlatform, string> = {
      FACEBOOK: `https://facebook.com/${request.externalAccountId}/posts/${mockId}`,
      INSTAGRAM: `https://instagram.com/p/${mockId}`,
      THREADS: `https://threads.net/@user/post/${mockId}`,
      TIKTOK: `https://tiktok.com/@user/video/${mockId}`,
      LINKEDIN: `https://linkedin.com/feed/update/urn:li:share:${mockId}`,
    };

    return {
      success: true,
      externalPostId: mockId,
      externalPostUrl: urls[this.platform] || `https://meta.com/post/${mockId}`,
      metadata: {
        publishedBy: 'MockSocialAdapter',
        simulatedAt: new Date().toISOString(),
        targetPlatform: this.platform,
      },
    };
  }
}
