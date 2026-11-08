import { z } from 'zod';

export const createSocialPostSchema = z.object({
  title: z.string().optional(),
  caption: z.string().min(1, 'El texto o copy del post es obligatorio'),
  contentType: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'REEL', 'CAROUSEL']).default('IMAGE'),
  objective: z.enum(['AWARENESS', 'ENGAGEMENT', 'LEADS', 'SALES', 'EDUCATION', 'PROMOTION']).default('LEADS'),
  productId: z.string().optional().nullable(),
  campaignId: z.string().optional().nullable(),
  cta: z.string().optional().nullable(),
  targetAccountIds: z.array(z.number()).min(1, 'Debes seleccionar al menos una cuenta destino'),
  mediaAssets: z.array(
    z.object({
      type: z.enum(['IMAGE', 'VIDEO']),
      url: z.string().url('La URL del medio debe ser válida'),
      mimeType: z.string().optional(),
      size: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      duration: z.number().optional(),
      position: z.number().default(0),
    })
  ).optional().default([]),
  scheduledAt: z.string().optional().nullable(),
  status: z.enum(['DRAFT', 'SCHEDULED']).optional(),
});

export const updateSocialPostSchema = createSocialPostSchema.partial();

export const connectSocialAccountSchema = z.object({
  platform: z.enum(['FACEBOOK', 'INSTAGRAM', 'THREADS', 'TIKTOK', 'LINKEDIN']),
  externalAccountId: z.string().min(1),
  externalBusinessId: z.string().optional(),
  name: z.string().min(1),
  username: z.string().optional(),
  profilePictureUrl: z.string().optional(),
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  expiresInSeconds: z.number().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const generateContentAiSchema = z.object({
  productName: z.string().optional(),
  productDescription: z.string().optional(),
  productPrice: z.string().optional(),
  objective: z.enum(['AWARENESS', 'ENGAGEMENT', 'LEADS', 'SALES', 'EDUCATION', 'PROMOTION']).default('LEADS'),
  targetAudience: z.string().optional(),
  platform: z.enum(['FACEBOOK', 'INSTAGRAM', 'THREADS', 'ALL']).default('ALL'),
  tone: z.string().optional().default('Persuasivo, profesional y orientado a conversión'),
  keyBenefits: z.array(z.string()).optional(),
  callToAction: z.string().optional(),
});
