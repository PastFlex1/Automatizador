export type MetaChannel = "whatsapp" | "instagram" | "messenger" | "threads";

export type LeadStatus =
  | "new_lead"
  | "qualifying"
  | "advised"
  | "proposal_sent"
  | "negotiating"
  | "ready_to_close"
  | "won_closed"
  | "lost";

export type LeadUrgency = "hot" | "warm" | "cold";

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  currency: string;
  description: string;
  features: string[];
  objectionHooks: {
    price?: string;
    trust?: string;
    timing?: string;
    guarantee?: string;
  };
  checkoutUrl: string;
  imageUrl: string;
  tagline: string;
}

export interface Message {
  id: string;
  sender: "customer" | "agent" | "ai_autopilot";
  content: string;
  timestamp: string;
  createdAt?: string | Date;
  type: "text" | "audio" | "product_card" | "payment_link" | "story_mention" | "quick_reply";
  deliveryStatus?: "sent" | "delivered" | "failed";
  deliveryError?: string;
  metaData?: {
    audioDuration?: string;
    product?: Product;
    paymentUrl?: string;
    amount?: number;
    storyMediaUrl?: string;
    discountPercent?: number;
  };
}

export interface LeadActivity {
  id: string;
  type: "phone" | "chat" | "email" | "proposal" | "calendar";
  title: string;
  description: string;
  date: string;
  manager: string;
  stageBadge: string;
}

export interface Lead {
  id: string;
  name: string;
  roleCompany?: string;
  dealCode?: string;
  manager?: string;
  email?: string;
  address?: string;
  actionSubpill?: string;
  handleOrPhone: string;
  avatar: string;
  channel: MetaChannel;
  pageName?: string;
  socialAccountName?: string;
  externalUserId?: string;
  status: LeadStatus;
  urgency: LeadUrgency;
  intentScore: number; // 0 - 100
  estimatedValue: number;
  tags: string[];
  lastMessage: string;
  lastActivity: string;
  unreadCount: number;
  notes: string;
  sourceCampaign?: string;
  interestProductId?: string;
  conversationHistory: Message[];
  detectedObjection?: string;
  activities?: LeadActivity[];
}

export interface BusinessProfile {
  businessName: string;
  niche: string;
  ownerName: string;
  defaultCurrency: string;
  advisorTone: "persuasivo" | "consultivo" | "directo_closer" | "empatico_cálido" | "vip_exclusivo";
  valueProposition: string;
  guaranteePolicy: string;
  paymentMethods: string[];
  autoPilotMode: boolean;
  autoCloseThreshold: number; // e.g. 80
  metaConnections: {
    whatsapp: { connected: boolean; number: string };
    instagram: { connected: boolean; handle: string };
    messenger: { connected: boolean; page: string };
  };
}

export interface AICloseStrategyResponse {
  intentScore: number;
  buyerTemperature: "hot" | "warm" | "cold";
  detectedObjections: string[];
  psychologicalTrigger: string;
  recommendedTechnique: string;
  primaryResponse: string;
  alternativeConsultative: string;
  alternativeUrgency: string;
  voiceNoteScript: string;
}

export interface CampaignVariant {
  id: number;
  tone: string;
  hook: string;
  message: string;
  callToAction: string;
}

export interface Campaign {
  id: string;
  title: string;
  channel: MetaChannel;
  targetAudience: string;
  sentCount: number;
  openRate: number;
  replyRate: number;
  salesClosed: number;
  revenue: number;
  status: "active" | "draft" | "completed";
  scheduledDate: string;
  messagePreview: string;
}
