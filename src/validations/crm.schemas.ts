import { z } from 'zod';

// Contact Schemas
export const createContactSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().min(3, 'Phone is too short').optional().or(z.literal('')),
  avatarUrl: z.string().url().optional().or(z.literal('')),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  language: z.string().default('es').optional(),
  timezone: z.string().default('America/New_York').optional(),
  address: z.string().optional(),
  tags: z.array(z.string()).default([]).optional(),
  notes: z.string().optional(),
});

export const updateContactSchema = createContactSchema.partial();

// Lead Schemas
export const leadStatusEnum = z.enum([
  'NEW',
  'CONTACTED',
  'QUALIFYING',
  'QUALIFIED',
  'UNQUALIFIED',
  'CONVERTED',
]);

export const leadTemperatureEnum = z.enum(['COLD', 'WARM', 'HOT']);

export const createLeadSchema = z.object({
  contactId: z.number().int().positive('Contact ID must be a positive integer'),
  source: z.string().default('DIRECT').optional(),
  sourceCampaign: z.string().optional(),
  status: leadStatusEnum.default('NEW').optional(),
  temperature: leadTemperatureEnum.default('WARM').optional(),
  score: z.number().int().min(0).max(100).default(50).optional(),
  productId: z.string().optional(),
  campaignId: z.string().optional(),
  detectedObjection: z.string().optional(),
});

export const updateLeadSchema = createLeadSchema.partial();

// Deal Schemas
export const dealStatusEnum = z.enum(['OPEN', 'WON', 'LOST']);

export const createDealSchema = z.object({
  contactId: z.number().int().positive('Contact ID must be a positive integer'),
  leadId: z.number().int().positive().optional(),
  pipelineId: z.number().int().positive().optional(),
  stageId: z.number().int().positive().optional(),
  stageKey: z.string().default('NEW').optional(),
  productId: z.string().optional(),
  title: z.string().min(1, 'Title is required'),
  value: z.number().min(0, 'Value must be positive or zero').default(0),
  currency: z.string().length(3, 'Currency must be a 3-letter ISO code').default('USD'),
  probability: z.number().int().min(0).max(100).default(50).optional(),
  expectedCloseDate: z.string().optional(),
  status: dealStatusEnum.default('OPEN').optional(),
  assignedUserId: z.number().int().positive().optional(),
});

export const updateDealSchema = createDealSchema.partial();

// Product Schemas
export const createProductSchema = z.object({
  id: z.string().min(1, 'ID is required').optional(),
  name: z.string().min(1, 'Product name is required'),
  description: z.string().optional(),
  category: z.string().default('General'),
  price: z.number().min(0, 'Price must be positive or zero'),
  currency: z.string().length(3).default('USD'),
  active: z.boolean().default(true).optional(),
  tagline: z.string().optional(),
  features: z.array(z.string()).default([]).optional(),
  objectionHooks: z.record(z.string(), z.string()).default({}).optional(),
  checkoutUrl: z.string().url().optional().or(z.literal('')),
  imageUrl: z.string().url().optional().or(z.literal('')),
});

export const updateProductSchema = createProductSchema.partial();

// Message Schemas
export const messageDirectionEnum = z.enum(['INBOUND', 'OUTBOUND']);
export const messageTypeEnum = z.enum([
  'TEXT',
  'IMAGE',
  'AUDIO',
  'VIDEO',
  'DOCUMENT',
  'product_card',
  'payment_link',
  'story_mention',
  'quick_reply',
]);

export const createMessageSchema = z.object({
  sender: z.string().min(1),
  direction: messageDirectionEnum.default('OUTBOUND').optional(),
  type: messageTypeEnum.default('TEXT').optional(),
  content: z.string().min(1, 'Message content cannot be empty'),
  externalMessageId: z.string().optional(),
  metaData: z.record(z.string(), z.any()).default({}).optional(),
  timestampStr: z.string().optional(),
});
