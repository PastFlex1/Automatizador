import { PublishRequest, PublishResult, SocialPlatform, SocialCapabilities } from '../types';

export interface SocialPublisherAdapter {
  readonly platform: SocialPlatform;
  getCapabilities(): SocialCapabilities;
  validatePost(request: PublishRequest): { isValid: boolean; error?: string };
  publish(request: PublishRequest): Promise<PublishResult>;
}
