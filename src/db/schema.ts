import { relations } from 'drizzle-orm';
import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  doublePrecision,
  numeric,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ==========================================
// 1. WORKSPACES (Multi-Tenant SaaS Boundary)
// ==========================================
export const workspaces = pgTable('workspaces', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  niche: text('niche'),
  ownerName: text('owner_name'),
  defaultCurrency: text('default_currency').notNull().default('USD'),
  advisorTone: text('advisor_tone').notNull().default('persuasivo'),
  valueProposition: text('value_proposition'),
  guaranteePolicy: text('guarantee_policy'),
  paymentMethods: jsonb('payment_methods').$type<string[]>().default([]),
  autoPilotMode: boolean('auto_pilot_mode').notNull().default(false),
  autoCloseThreshold: integer('auto_close_threshold').notNull().default(80),
  metaConnections: jsonb('meta_connections').$type<any>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ==========================================
// 2. USERS (Internal CRM Team Members)
// ==========================================
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(), // Auth UID
    workspaceId: integer('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    email: text('email').notNull(),
    name: text('name'),
    displayName: text('display_name'),
    photoUrl: text('photo_url'),
    role: text('role').notNull().default('ADMIN'), // 'OWNER' | 'ADMIN' | 'AGENT'
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_users_workspace').on(table.workspaceId),
    index('idx_users_workspace_email').on(table.workspaceId, table.email),
  ]
);

// ==========================================
// 3. CONTACTS (The Real Human Being)
// ==========================================
export const contacts = pgTable(
  'contacts',
  {
    id: serial('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    name: text('name').notNull(),
    email: text('email'),
    phone: text('phone'),
    avatarUrl: text('avatar_url'),
    company: text('company'),
    jobTitle: text('job_title'),
    language: text('language').default('es'),
    timezone: text('timezone').default('America/New_York'),
    address: text('address'),
    tags: jsonb('tags').$type<string[]>().default([]),
    notes: text('notes'),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_contacts_workspace').on(table.workspaceId),
    index('idx_contacts_workspace_email').on(table.workspaceId, table.email),
    index('idx_contacts_workspace_phone').on(table.workspaceId, table.phone),
    index('idx_contacts_created_at').on(table.createdAt),
  ]
);

// ==========================================
// 4. SOCIAL IDENTITIES (External Meta Mapping)
// ==========================================
export const socialIdentities = pgTable(
  'social_identities',
  {
    id: serial('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    contactId: integer('contact_id')
      .references(() => contacts.id)
      .notNull(),
    platform: text('platform').notNull(), // 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER' | 'FACEBOOK' | 'THREADS'
    externalUserId: text('external_user_id').notNull(),
    username: text('username'),
    metadata: jsonb('metadata').$type<any>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_social_identities_contact').on(table.contactId),
    uniqueIndex('idx_social_identities_unique').on(
      table.workspaceId,
      table.platform,
      table.externalUserId
    ),
  ]
);

// ==========================================
// 5. PRODUCTS (Commercial Catalog)
// ==========================================
export const products = pgTable(
  'products',
  {
    id: text('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    name: text('name').notNull(),
    description: text('description'),
    category: text('category').notNull().default('General'),
    price: numeric('price', { precision: 12, scale: 2 }).notNull().default('0.00'),
    currency: text('currency').notNull().default('USD'),
    active: boolean('active').notNull().default(true),
    tagline: text('tagline'),
    features: jsonb('features').$type<string[]>().default([]),
    objectionHooks: jsonb('objection_hooks').$type<Record<string, string>>().default({}),
    checkoutUrl: text('checkout_url'),
    imageUrl: text('image_url'),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_products_workspace').on(table.workspaceId),
  ]
);

// ==========================================
// 6. PIPELINES & STAGES
// ==========================================
export const pipelines = pgTable(
  'pipelines',
  {
    id: serial('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    name: text('name').notNull().default('Sales Pipeline'),
    isDefault: boolean('is_default').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_pipelines_workspace').on(table.workspaceId),
  ]
);

export const pipelineStages = pgTable(
  'pipeline_stages',
  {
    id: serial('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    pipelineId: integer('pipeline_id')
      .references(() => pipelines.id)
      .notNull(),
    name: text('name').notNull(),
    key: text('key').notNull(), // 'NEW' | 'CONTACTED' | 'QUALIFYING' | 'QUALIFIED' | 'ADVISED' | 'NEGOTIATING' | 'READY_TO_CLOSE' | 'WON' | 'LOST'
    position: integer('position').notNull(),
    probability: integer('probability').notNull().default(50),
    isWon: boolean('is_won').notNull().default(false),
    isLost: boolean('is_lost').notNull().default(false),
    badgeColor: text('badge_color'),
    bgHeader: text('bg_header'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_stages_pipeline').on(table.pipelineId),
    index('idx_stages_key').on(table.workspaceId, table.key),
  ]
);

// ==========================================
// 7. LEADS (Commercial Intent)
// ==========================================
export const leads = pgTable(
  'leads',
  {
    id: serial('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    contactId: integer('contact_id')
      .references(() => contacts.id)
      .notNull(),
    source: text('source').default('DIRECT'),
    sourceCampaign: text('source_campaign'),
    status: text('status').notNull().default('NEW'), // 'NEW' | 'CONTACTED' | 'QUALIFYING' | 'QUALIFIED' | 'UNQUALIFIED' | 'CONVERTED'
    temperature: text('temperature').notNull().default('WARM'), // 'COLD' | 'WARM' | 'HOT'
    score: integer('score').notNull().default(50),
    productId: text('product_id').references(() => products.id),
    campaignId: text('campaign_id'),
    sourceSocialPostId: integer('source_social_post_id'),
    sourceSocialAccountId: integer('source_social_account_id'),
    detectedObjection: text('detected_objection'),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_leads_workspace').on(table.workspaceId),
    index('idx_leads_contact').on(table.contactId),
    index('idx_leads_status').on(table.workspaceId, table.status),
    index('idx_leads_temperature').on(table.workspaceId, table.temperature),
  ]
);

// ==========================================
// 8. DEALS (Economic Opportunity)
// ==========================================
export const deals = pgTable(
  'deals',
  {
    id: serial('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    contactId: integer('contact_id')
      .references(() => contacts.id)
      .notNull(),
    leadId: integer('lead_id').references(() => leads.id),
    pipelineId: integer('pipeline_id').references(() => pipelines.id),
    stageId: integer('stage_id').references(() => pipelineStages.id),
    stageKey: text('stage_key').notNull().default('NEW'),
    productId: text('product_id').references(() => products.id),
    title: text('title').notNull(),
    value: numeric('value', { precision: 12, scale: 2 }).notNull().default('0.00'),
    currency: text('currency').notNull().default('USD'),
    probability: integer('probability').notNull().default(50),
    expectedCloseDate: text('expected_close_date'),
    status: text('status').notNull().default('OPEN'), // 'OPEN' | 'WON' | 'LOST'
    assignedUserId: integer('assigned_user_id').references(() => users.id),
    wonAt: timestamp('won_at'),
    lostAt: timestamp('lost_at'),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_deals_workspace').on(table.workspaceId),
    index('idx_deals_contact').on(table.contactId),
    index('idx_deals_stage').on(table.stageId),
    index('idx_deals_status').on(table.workspaceId, table.status),
  ]
);

// ==========================================
// 9. CONVERSATIONS (Omnichannel Chat Threads)
// ==========================================
export const conversations = pgTable(
  'conversations',
  {
    id: serial('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    contactId: integer('contact_id')
      .references(() => contacts.id)
      .notNull(),
    channel: text('channel').notNull().default('WHATSAPP'), // 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER' | 'FACEBOOK' | 'THREADS' | 'INTERNAL'
    externalConversationId: text('external_conversation_id'),
    status: text('status').notNull().default('OPEN'), // 'OPEN' | 'PENDING' | 'CLOSED'
    assignedUserId: integer('assigned_user_id').references(() => users.id),
    lastMessage: text('last_message'),
    lastMessageAt: timestamp('last_message_at').defaultNow(),
    unreadCount: integer('unread_count').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_conversations_workspace').on(table.workspaceId),
    index('idx_conversations_contact').on(table.contactId),
    index('idx_conversations_status').on(table.workspaceId, table.status),
  ]
);

// ==========================================
// 10. MESSAGES (Individual Chat Messages)
// ==========================================
export const messages = pgTable(
  'messages',
  {
    id: serial('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    conversationId: integer('conversation_id')
      .references(() => conversations.id)
      .notNull(),
    direction: text('direction').notNull().default('INBOUND'), // 'INBOUND' | 'OUTBOUND'
    sender: text('sender').notNull(), // 'customer' | 'agent' | 'ai_autopilot'
    type: text('type').notNull().default('TEXT'), // 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT' | 'product_card' | 'payment_link'
    content: text('content').notNull(),
    externalMessageId: text('external_message_id'),
    metaData: jsonb('meta_data').$type<any>().default({}),
    sentAt: timestamp('sent_at'),
    deliveredAt: timestamp('delivered_at'),
    readAt: timestamp('read_at'),
    timestampStr: text('timestamp_str'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_messages_conversation').on(table.conversationId),
    index('idx_messages_workspace').on(table.workspaceId),
  ]
);

// ==========================================
// 11. ACTIVITIES (Commercial History / Audit Log)
// ==========================================
export const activities = pgTable(
  'activities',
  {
    id: serial('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    contactId: integer('contact_id').references(() => contacts.id),
    leadId: integer('lead_id').references(() => leads.id),
    dealId: integer('deal_id').references(() => deals.id),
    conversationId: integer('conversation_id').references(() => conversations.id),
    userId: integer('user_id').references(() => users.id),
    type: text('type').notNull(), // 'CONTACT_CREATED' | 'LEAD_CREATED' | 'DEAL_CREATED' | 'STAGE_CHANGED' | 'MESSAGE_RECEIVED' | 'MESSAGE_SENT' | 'NOTE_ADDED' | 'DEAL_WON' | 'DEAL_LOST'
    title: text('title').notNull(),
    description: text('description'),
    stageBadge: text('stage_badge'),
    manager: text('manager'),
    metadata: jsonb('metadata').$type<any>().default({}),
    date: text('date'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_activities_workspace').on(table.workspaceId),
    index('idx_activities_contact').on(table.contactId),
    index('idx_activities_deal').on(table.dealId),
    index('idx_activities_created_at').on(table.createdAt),
  ]
);

// ==========================================
// 12. CAMPAIGNS (Marketing Broadcasts)
// ==========================================
export const campaigns = pgTable(
  'campaigns',
  {
    id: text('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    productId: text('product_id').references(() => products.id),
    title: text('title').notNull(),
    channel: text('channel').notNull().default('WHATSAPP'),
    targetAudience: text('target_audience'),
    sentCount: integer('sent_count').notNull().default(0),
    openRate: doublePrecision('open_rate').notNull().default(0),
    replyRate: doublePrecision('reply_rate').notNull().default(0),
    salesClosed: integer('sales_closed').notNull().default(0),
    revenue: numeric('revenue', { precision: 12, scale: 2 }).notNull().default('0.00'),
    status: text('status').notNull().default('active'),
    scheduledDate: text('scheduled_date'),
    messagePreview: text('message_preview'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_campaigns_workspace').on(table.workspaceId),
  ]
);

// ==========================================
// 13. SOCIAL ACCOUNTS (Connected Social Profiles)
// ==========================================
export const socialAccounts = pgTable(
  'social_accounts',
  {
    id: serial('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    platform: text('platform').notNull(), // 'FACEBOOK' | 'INSTAGRAM' | 'THREADS'
    externalAccountId: text('external_account_id').notNull(),
    externalBusinessId: text('external_business_id'),
    name: text('name').notNull(),
    username: text('username'),
    profilePictureUrl: text('profile_picture_url'),
    status: text('status').notNull().default('CONNECTED'), // 'CONNECTED' | 'EXPIRED' | 'DISCONNECTED' | 'ERROR'
    accessTokenEncrypted: text('access_token_encrypted'),
    refreshTokenEncrypted: text('refresh_token_encrypted'),
    tokenExpiresAt: timestamp('token_expires_at'),
    metadata: jsonb('metadata').$type<any>().default({}),
    connectedAt: timestamp('connected_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_social_accounts_workspace').on(table.workspaceId),
    index('idx_social_accounts_platform').on(table.workspaceId, table.platform),
  ]
);

// ==========================================
// 14. SOCIAL POSTS (Content Created/Scheduled)
// ==========================================
export const socialPosts = pgTable(
  'social_posts',
  {
    id: serial('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title'),
    caption: text('caption').notNull(),
    contentType: text('content_type').notNull().default('IMAGE'), // 'TEXT' | 'IMAGE' | 'VIDEO' | 'REEL' | 'CAROUSEL'
    objective: text('objective').default('LEADS'), // 'AWARENESS' | 'ENGAGEMENT' | 'LEADS' | 'SALES' | 'EDUCATION' | 'PROMOTION'
    status: text('status').notNull().default('DRAFT'), // 'DRAFT' | 'SCHEDULED' | 'PROCESSING' | 'PUBLISHED' | 'PARTIALLY_PUBLISHED' | 'FAILED'
    scheduledAt: timestamp('scheduled_at'),
    publishedAt: timestamp('published_at'),
    productId: text('product_id').references(() => products.id, { onDelete: 'set null' }),
    campaignId: text('campaign_id'),
    cta: text('cta'),
    targetPlatforms: jsonb('target_platforms').$type<string[]>().default([]),
    createdById: integer('created_by_id'),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_social_posts_workspace').on(table.workspaceId),
    index('idx_social_posts_status').on(table.workspaceId, table.status),
    index('idx_social_posts_scheduled').on(table.workspaceId, table.scheduledAt),
  ]
);

// ==========================================
// 15. SOCIAL POST TARGETS (Per-network publish log)
// ==========================================
export const socialPostTargets = pgTable(
  'social_post_targets',
  {
    id: serial('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    socialPostId: integer('social_post_id')
      .references(() => socialPosts.id, { onDelete: 'cascade' })
      .notNull(),
    socialAccountId: integer('social_account_id')
      .references(() => socialAccounts.id, { onDelete: 'cascade' })
      .notNull(),
    platform: text('platform').notNull(), // 'FACEBOOK' | 'INSTAGRAM' | 'THREADS'
    status: text('status').notNull().default('PENDING'), // 'PENDING' | 'PROCESSING' | 'PUBLISHED' | 'FAILED'
    externalPostId: text('external_post_id'),
    externalPostUrl: text('external_post_url'),
    publishedAt: timestamp('published_at'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    metadata: jsonb('metadata').$type<any>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_post_targets_post').on(table.socialPostId),
    index('idx_post_targets_workspace').on(table.workspaceId),
  ]
);

// ==========================================
// 16. SOCIAL MEDIA ASSETS (Images & Videos)
// ==========================================
export const socialMediaAssets = pgTable(
  'social_media_assets',
  {
    id: serial('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    socialPostId: integer('social_post_id')
      .references(() => socialPosts.id, { onDelete: 'cascade' })
      .notNull(),
    type: text('type').notNull(), // 'IMAGE' | 'VIDEO'
    url: text('url').notNull(),
    mimeType: text('mime_type'),
    size: integer('size'),
    width: integer('width'),
    height: integer('height'),
    duration: doublePrecision('duration'),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_media_assets_post').on(table.socialPostId),
  ]
);

// ==========================================
// 17. SOCIAL POST ANALYTICS
// ==========================================
export const socialPostAnalytics = pgTable(
  'social_post_analytics',
  {
    id: serial('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    socialPostId: integer('social_post_id')
      .references(() => socialPosts.id, { onDelete: 'cascade' })
      .notNull(),
    socialPostTargetId: integer('social_post_target_id')
      .references(() => socialPostTargets.id, { onDelete: 'cascade' }),
    platform: text('platform'),
    impressions: integer('impressions').default(0),
    reach: integer('reach').default(0),
    likes: integer('likes').default(0),
    comments: integer('comments').default(0),
    shares: integer('shares').default(0),
    saves: integer('saves').default(0),
    views: integer('views').default(0),
    clicks: integer('clicks').default(0),
    leadsGenerated: integer('leads_generated').default(0),
    dealsGenerated: integer('deals_generated').default(0),
    salesGenerated: integer('sales_generated').default(0),
    revenueGenerated: numeric('revenue_generated', { precision: 12, scale: 2 }).default('0.00'),
    lastSyncedAt: timestamp('last_synced_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_post_analytics_post').on(table.socialPostId),
  ]
);

// ==========================================
// 18. SOCIAL INTERACTIONS (Comments, Mentions & DMs)
// ==========================================
export const socialInteractions = pgTable(
  'social_interactions',
  {
    id: serial('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    socialAccountId: integer('social_account_id')
      .references(() => socialAccounts.id, { onDelete: 'set null' }),
    socialPostId: integer('social_post_id')
      .references(() => socialPosts.id, { onDelete: 'set null' }),
    externalInteractionId: text('external_interaction_id').notNull(),
    platform: text('platform').notNull(), // 'FACEBOOK' | 'INSTAGRAM' | 'THREADS' | 'WHATSAPP'
    type: text('type').notNull(), // 'COMMENT' | 'DIRECT_MESSAGE' | 'MENTION'
    externalUserId: text('external_user_id').notNull(),
    authorName: text('author_name'),
    authorUsername: text('author_username'),
    content: text('content').notNull(),
    parentExternalId: text('parent_external_id'),
    processingStatus: text('processing_status').notNull().default('RECEIVED'), // 'RECEIVED' | 'PROCESSED' | 'IGNORED' | 'FAILED'
    metadata: jsonb('metadata').$type<any>().default({}),
    contactId: integer('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    leadId: integer('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    occurredAt: timestamp('occurred_at').defaultNow().notNull(),
    processedAt: timestamp('processed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_interactions_post').on(table.socialPostId),
    index('idx_interactions_workspace').on(table.workspaceId),
    uniqueIndex('idx_interactions_unique_event').on(
      table.workspaceId,
      table.platform,
      table.externalInteractionId
    ),
  ]
);

// ==========================================
// 19. SOCIAL TRIGGERS (Lead Generation Keyword Rules)
// ==========================================
export const socialTriggers = pgTable(
  'social_triggers',
  {
    id: serial('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    socialPostId: integer('social_post_id')
      .references(() => socialPosts.id, { onDelete: 'cascade' }),
    type: text('type').notNull().default('COMMENT_KEYWORD'), // 'COMMENT_KEYWORD' | 'DM_KEYWORD'
    keywords: jsonb('keywords').$type<string[]>().default([]).notNull(),
    productId: text('product_id').references(() => products.id, { onDelete: 'set null' }),
    action: text('action').notNull().default('CREATE_LEAD'), // 'CREATE_LEAD'
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_triggers_workspace').on(table.workspaceId),
    index('idx_triggers_post').on(table.socialPostId),
  ]
);

// ==========================================
// RELATIONS
// ==========================================
export const workspacesRelations = relations(workspaces, ({ many }) => ({
  users: many(users),
  contacts: many(contacts),
  products: many(products),
  pipelines: many(pipelines),
  pipelineStages: many(pipelineStages),
  leads: many(leads),
  deals: many(deals),
  conversations: many(conversations),
  activities: many(activities),
  campaigns: many(campaigns),
  socialAccounts: many(socialAccounts),
  socialPosts: many(socialPosts),
  socialTriggers: many(socialTriggers),
}));

export const socialAccountsRelations = relations(socialAccounts, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [socialAccounts.workspaceId],
    references: [workspaces.id],
  }),
  targets: many(socialPostTargets),
  interactions: many(socialInteractions),
}));

export const socialPostsRelations = relations(socialPosts, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [socialPosts.workspaceId],
    references: [workspaces.id],
  }),
  product: one(products, {
    fields: [socialPosts.productId],
    references: [products.id],
  }),
  targets: many(socialPostTargets),
  assets: many(socialMediaAssets),
  analytics: many(socialPostAnalytics),
  interactions: many(socialInteractions),
  triggers: many(socialTriggers),
}));

export const socialTriggersRelations = relations(socialTriggers, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [socialTriggers.workspaceId],
    references: [workspaces.id],
  }),
  post: one(socialPosts, {
    fields: [socialTriggers.socialPostId],
    references: [socialPosts.id],
  }),
  product: one(products, {
    fields: [socialTriggers.productId],
    references: [products.id],
  }),
}));

export const socialPostTargetsRelations = relations(socialPostTargets, ({ one }) => ({
  post: one(socialPosts, {
    fields: [socialPostTargets.socialPostId],
    references: [socialPosts.id],
  }),
  account: one(socialAccounts, {
    fields: [socialPostTargets.socialAccountId],
    references: [socialAccounts.id],
  }),
}));

export const socialMediaAssetsRelations = relations(socialMediaAssets, ({ one }) => ({
  post: one(socialPosts, {
    fields: [socialMediaAssets.socialPostId],
    references: [socialPosts.id],
  }),
}));

export const socialPostAnalyticsRelations = relations(socialPostAnalytics, ({ one }) => ({
  post: one(socialPosts, {
    fields: [socialPostAnalytics.socialPostId],
    references: [socialPosts.id],
  }),
  target: one(socialPostTargets, {
    fields: [socialPostAnalytics.socialPostTargetId],
    references: [socialPostTargets.id],
  }),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [contacts.workspaceId],
    references: [workspaces.id],
  }),
  socialIdentities: many(socialIdentities),
  leads: many(leads),
  deals: many(deals),
  conversations: many(conversations),
  activities: many(activities),
}));

export const socialIdentitiesRelations = relations(socialIdentities, ({ one }) => ({
  contact: one(contacts, {
    fields: [socialIdentities.contactId],
    references: [contacts.id],
  }),
}));

export const pipelinesRelations = relations(pipelines, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [pipelines.workspaceId],
    references: [workspaces.id],
  }),
  stages: many(pipelineStages),
  deals: many(deals),
}));

export const pipelineStagesRelations = relations(pipelineStages, ({ one, many }) => ({
  pipeline: one(pipelines, {
    fields: [pipelineStages.pipelineId],
    references: [pipelines.id],
  }),
  deals: many(deals),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
  contact: one(contacts, {
    fields: [leads.contactId],
    references: [contacts.id],
  }),
  product: one(products, {
    fields: [leads.productId],
    references: [products.id],
  }),
  deals: many(deals),
  activities: many(activities),
}));

export const dealsRelations = relations(deals, ({ one, many }) => ({
  contact: one(contacts, {
    fields: [deals.contactId],
    references: [contacts.id],
  }),
  lead: one(leads, {
    fields: [deals.leadId],
    references: [leads.id],
  }),
  pipeline: one(pipelines, {
    fields: [deals.pipelineId],
    references: [pipelines.id],
  }),
  stage: one(pipelineStages, {
    fields: [deals.stageId],
    references: [pipelineStages.id],
  }),
  product: one(products, {
    fields: [deals.productId],
    references: [products.id],
  }),
  activities: many(activities),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  contact: one(contacts, {
    fields: [conversations.contactId],
    references: [contacts.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

// ==========================================
// 19. FACEBOOK GROUPS (Social Seller AI)
// ==========================================
export const facebookGroups = pgTable(
  'facebook_groups',
  {
    id: serial('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    name: text('name').notNull(),
    fbUrl: text('fb_url'),
    category: text('category'),
    city: text('city'),
    status: text('status').default('ACTIVE'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_fb_groups_workspace').on(table.workspaceId),
  ]
);

// ==========================================
// 20. PUBLICATIONS (Social Seller AI)
// ==========================================
export const publications = pgTable(
  'publications',
  {
    id: serial('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    productId: text('product_id')
      .references(() => products.id),
    targetGroupId: integer('target_group_id')
      .references(() => facebookGroups.id),
    channel: text('channel').notNull().default('MARKETPLACE'),
    copyVariant: text('copy_variant'),
    status: text('status').default('DRAFT'),
    fbPostUrl: text('fb_post_url'),
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_publications_workspace').on(table.workspaceId),
    index('idx_publications_product').on(table.productId),
  ]
);

export const facebookGroupsRelations = relations(facebookGroups, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [facebookGroups.workspaceId],
    references: [workspaces.id],
  }),
  publications: many(publications),
}));

export const publicationsRelations = relations(publications, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [publications.workspaceId],
    references: [workspaces.id],
  }),
  product: one(products, {
    fields: [publications.productId],
    references: [products.id],
  }),
  group: one(facebookGroups, {
    fields: [publications.targetGroupId],
    references: [facebookGroups.id],
  }),
}));

