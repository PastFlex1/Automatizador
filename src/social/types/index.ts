export type SocialPlatform = 'FACEBOOK' | 'INSTAGRAM' | 'THREADS' | 'TIKTOK' | 'LINKEDIN';

export type SocialAccountStatus = 'CONNECTED' | 'EXPIRED' | 'DISCONNECTED' | 'ERROR';

export type SocialContentType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'REEL' | 'STORY' | 'CAROUSEL';

export type SocialPostStatus = 'DRAFT' | 'SCHEDULED' | 'PROCESSING' | 'PUBLISHED' | 'PARTIALLY_PUBLISHED' | 'FAILED';

export type SocialTargetStatus = 'PENDING' | 'PROCESSING' | 'PUBLISHED' | 'FAILED';

export type SocialObjective = 'AWARENESS' | 'ENGAGEMENT' | 'LEADS' | 'SALES' | 'EDUCATION' | 'PROMOTION';

export interface SocialCapabilities {
  text: boolean;
  image: boolean;
  video: boolean;
  reel: boolean;
  carousel: boolean;
  story: boolean;
  maxCaptionLength: number;
}

export const PLATFORM_CAPABILITIES: Record<SocialPlatform, SocialCapabilities> = {
  FACEBOOK: {
    text: true,
    image: true,
    video: true,
    reel: true,
    story: true,
    carousel: true,
    maxCaptionLength: 63206,
  },
  INSTAGRAM: {
    text: false, // Instagram requires media (photo/video)
    image: true,
    video: true,
    reel: true,
    story: true,
    carousel: true,
    maxCaptionLength: 2200,
  },
  THREADS: {
    text: true,
    image: true,
    video: true,
    reel: false,
    story: false,
    carousel: false,
    maxCaptionLength: 500,
  },
  TIKTOK: {
    text: false,
    image: false,
    video: true,
    reel: true,
    story: true,
    carousel: false,
    maxCaptionLength: 2200,
  },
  LINKEDIN: {
    text: true,
    image: true,
    video: true,
    reel: false,
    story: false,
    carousel: true,
    maxCaptionLength: 3000,
  },
};

export interface PublishRequest {
  workspaceId: number;
  postId: number;
  targetId: number;
  platform: SocialPlatform;
  accountId: number;
  accessToken: string;
  externalAccountId: string;
  caption: string;
  contentType: SocialContentType;
  mediaAssets: {
    type: 'IMAGE' | 'VIDEO';
    url: string;
    position: number;
  }[];
}

export interface PublishResult {
  success: boolean;
  externalPostId?: string;
  externalPostUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  metadata?: any;
}

export interface AIGeneratedContentOption {
  hook: string;
  caption: string;
  cta: string;
  hashtags: string[];
  contentIdea: string;
  recommendedFormat: SocialContentType;
}
