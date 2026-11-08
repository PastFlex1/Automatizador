import crypto from 'crypto';
import { db } from '../db';
import * as schema from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { MetaSignatureValidator } from '../meta/webhooks/meta-signature.validator';
import { MetaWebhookNormalizer } from '../meta/webhooks/meta-webhook.normalizer';
import { SocialTriggerService } from '../social/services/social-trigger.service';
import { SocialInteractionService } from '../social/services/social-interaction.service';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING META WEBHOOK & LEAD CAPTURE TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} ${details ? '- ' + details : ''}`);
      failed++;
    }
  }

  const workspaceId = 1;
  const testPageId = '1323037820891730'; // Real/Demo Page ID configured in workspace
  const testAppSecret = 'test_meta_app_secret_1234567890abcdef';

  // Ensure connected socialAccount exists for testPageId
  let [acc] = await db
    .select()
    .from(schema.socialAccounts)
    .where(eq(schema.socialAccounts.externalAccountId, testPageId))
    .limit(1);

  if (!acc) {
    [acc] = await db
      .insert(schema.socialAccounts)
      .values({
        workspaceId,
        platform: 'FACEBOOK',
        externalAccountId: testPageId,
        name: 'APM inox 1',
        status: 'CONNECTED',
        accessTokenEncrypted: 'test_token',
      })
      .returning();
  }

  // Ensure a test social post & target exist for attribution testing
  const [testPost] = await db
    .insert(schema.socialPosts)
    .values({
      workspaceId,
      caption: 'Publicación de prueba para captura de prospectos',
      status: 'PUBLISHED',
      contentType: 'TEXT',
    })
    .returning();

  const testExternalPostId = `${testPageId}_${Date.now()}`;
  await db.insert(schema.socialPostTargets).values({
    workspaceId,
    socialPostId: testPost.id,
    socialAccountId: acc.id,
    platform: 'FACEBOOK',
    status: 'PUBLISHED',
    externalPostId: testExternalPostId,
    publishedAt: new Date(),
  });

  // --- TEST 1: Normalizer Feed Comment ---
  try {
    const rawFeedPayload = {
      object: 'page',
      entry: [
        {
          id: testPageId,
          time: 1726329600,
          changes: [
            {
              field: 'feed',
              value: {
                item: 'comment',
                verb: 'add',
                comment_id: `${testPageId}_998877665544_11223344`,
                post_id: testExternalPostId,
                parent_id: testExternalPostId,
                from: { id: 'fb_user_test_001', name: 'Laura Gómez' },
                message: 'Hola! Cuál es el precio de este producto?',
                created_time: 1726329600,
              },
            },
          ],
        },
      ],
    };

    const normalizedEvents = MetaWebhookNormalizer.normalizePayload(rawFeedPayload);
    assert(
      normalizedEvents.length === 1 &&
        normalizedEvents[0].type === 'COMMENT' &&
        normalizedEvents[0].externalUserId === 'fb_user_test_001' &&
        normalizedEvents[0].authorName === 'Laura Gómez' &&
        normalizedEvents[0].content === 'Hola! Cuál es el precio de este producto?' &&
        normalizedEvents[0].externalPostId === testExternalPostId,
      'TEST 1: Normalizer Facebook Feed Comment'
    );
  } catch (err: any) {
    assert(false, 'TEST 1: Normalizer Facebook Feed Comment', err.message);
  }

  // --- TEST 2: Normalizer Messenger Inbound Message ---
  try {
    const rawMessengerPayload = {
      object: 'page',
      entry: [
        {
          id: testPageId,
          messaging: [
            {
              sender: { id: 'fb_user_msg_002', name: 'Roberto Díaz' },
              recipient: { id: testPageId },
              timestamp: 1726329650000,
              message: {
                mid: 'mid.test_msg_987654321',
                text: 'Quisiera cotizar un presupuesto para mi empresa',
              },
            },
          ],
        },
      ],
    };

    const normalizedMsgEvents = MetaWebhookNormalizer.normalizePayload(rawMessengerPayload);
    assert(
      normalizedMsgEvents.length === 1 &&
        normalizedMsgEvents[0].type === 'DIRECT_MESSAGE' &&
        normalizedMsgEvents[0].externalUserId === 'fb_user_msg_002' &&
        normalizedMsgEvents[0].content === 'Quisiera cotizar un presupuesto para mi empresa' &&
        normalizedMsgEvents[0].externalInteractionId === 'mid.test_msg_987654321',
      'TEST 2: Normalizer Messenger Inbound Message'
    );
  } catch (err: any) {
    assert(false, 'TEST 2: Normalizer Messenger Inbound Message', err.message);
  }

  // --- TEST 3: Signature Validation ---
  try {
    const rawBodyBuffer = Buffer.from(JSON.stringify({ test: 'payload' }), 'utf8');
    const hmac = crypto.createHmac('sha256', testAppSecret);
    hmac.update(rawBodyBuffer);
    const validSignature = `sha256=${hmac.digest('hex')}`;
    const invalidSignature = `sha256=badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadb`;

    const validResult = MetaSignatureValidator.validateSignature(
      rawBodyBuffer,
      validSignature,
      testAppSecret
    );
    const invalidResult = MetaSignatureValidator.validateSignature(
      rawBodyBuffer,
      invalidSignature,
      testAppSecret
    );

    assert(
      validResult.valid === true && invalidResult.valid === false,
      'TEST 3: Cryptographic HMAC-SHA256 Signature Verification'
    );
  } catch (err: any) {
    assert(false, 'TEST 3: Cryptographic HMAC-SHA256 Signature Verification', err.message);
  }

  // --- TEST 4: Keyword Trigger Evaluation with Accent Normalization ---
  try {
    const match1 = SocialTriggerService.matchKeywordList(
      'Hola, me gustaría saber el PRECIO y si tienen catálogo disponible',
      ['PRECIO', 'COTIZAR']
    );
    const match2 = SocialTriggerService.matchKeywordList(
      'Quiero información sobre la cotización',
      ['INFORMACION', 'COTIZACION']
    );
    const matchNonLead = SocialTriggerService.matchKeywordList(
      'Buen trabajo, felicidades por la foto!',
      ['PRECIO', 'COTIZAR', 'INFO']
    );

    assert(
      match1.matched === true &&
        match1.matchedKeyword === 'PRECIO' &&
        match2.matched === true &&
        matchNonLead.matched === false,
      'TEST 4: Deterministic Keyword Trigger Evaluation (Diacritic & Case Insensitive)'
    );
  } catch (err: any) {
    assert(false, 'TEST 4: Deterministic Keyword Trigger Evaluation', err.message);
  }

  // --- TEST 5: Custom Post-Specific Trigger Rules ---
  try {
    const [customTrigger] = await db
      .insert(schema.socialTriggers)
      .values({
        workspaceId,
        socialPostId: testPost.id,
        type: 'COMMENT_KEYWORD',
        keywords: ['ACERO', 'INOXIDABLE'],
        action: 'CREATE_LEAD',
        active: true,
      })
      .returning();

    const evaluation = await SocialTriggerService.evaluateTriggers(
      workspaceId,
      testPost.id,
      'Me interesa el material en acero inoxidable'
    );

    assert(
      evaluation.matched === true && evaluation.triggerId === customTrigger.id,
      'TEST 5: Post-Specific Custom Trigger Rules Match'
    );
  } catch (err: any) {
    assert(false, 'TEST 5: Post-Specific Custom Trigger Rules Match', err.message);
  }

  // --- TEST 6: Inbound Comment Processing -> Contact + SocialIdentity + Lead ---
  const commentInteractionId = `comment_test_${Date.now()}`;
  try {
    const testCommentEvent = {
      platform: 'FACEBOOK' as const,
      type: 'COMMENT' as const,
      externalPageId: testPageId,
      externalInteractionId: commentInteractionId,
      externalUserId: 'fb_user_lead_003',
      authorName: 'Marcela Vega',
      externalPostId: testExternalPostId,
      content: 'Me interesa cotizar este producto para mi negocio',
      occurredAt: new Date(),
      rawPayload: {},
    };

    const processResult = await SocialInteractionService.processEvent(testCommentEvent);

    assert(
      processResult.success === true &&
        processResult.isCommercialLead === true &&
        typeof processResult.contactId === 'number' &&
        typeof processResult.leadId === 'number' &&
        processResult.sourceSocialPostId === testPost.id,
      'TEST 6: Inbound Facebook Comment converts to Contact, Lead & SocialIdentity'
    );
  } catch (err: any) {
    assert(false, 'TEST 6: Inbound Facebook Comment converts to Contact, Lead & SocialIdentity', err.message);
  }

  // --- TEST 7: Idempotency Verification ---
  try {
    // Replay the exact same comment event
    const replayCommentEvent = {
      platform: 'FACEBOOK' as const,
      type: 'COMMENT' as const,
      externalPageId: testPageId,
      externalInteractionId: commentInteractionId,
      externalUserId: 'fb_user_lead_003',
      authorName: 'Marcela Vega',
      externalPostId: testExternalPostId,
      content: 'Me interesa cotizar este producto para mi negocio',
      occurredAt: new Date(),
      rawPayload: {},
    };

    const replayResult = await SocialInteractionService.processEvent(replayCommentEvent);
    assert(
      replayResult.success === true && replayResult.duplicate === true,
      'TEST 7: Strict Webhook Idempotency (Duplicate Events are Ignored)'
    );
  } catch (err: any) {
    assert(false, 'TEST 7: Strict Webhook Idempotency', err.message);
  }

  // --- TEST 8: Lead Deduplication for Repeated User Comments ---
  try {
    // Same user comments again with another comment ID
    const secondCommentEvent = {
      platform: 'FACEBOOK' as const,
      type: 'COMMENT' as const,
      externalPageId: testPageId,
      externalInteractionId: `comment_test_second_${Date.now()}`,
      externalUserId: 'fb_user_lead_003',
      authorName: 'Marcela Vega',
      externalPostId: testExternalPostId,
      content: 'Favor de enviar el precio por favor',
      occurredAt: new Date(),
      rawPayload: {},
    };

    const countLeadsBefore = (
      await db
        .select()
        .from(schema.leads)
        .where(
          and(
            eq(schema.leads.workspaceId, workspaceId),
            eq(schema.leads.source, 'FACEBOOK')
          )
        )
    ).length;

    const secondResult = await SocialInteractionService.processEvent(secondCommentEvent);

    const countLeadsAfter = (
      await db
        .select()
        .from(schema.leads)
        .where(
          and(
            eq(schema.leads.workspaceId, workspaceId),
            eq(schema.leads.source, 'FACEBOOK')
          )
        )
    ).length;

    assert(
      secondResult.success === true && countLeadsAfter === countLeadsBefore,
      'TEST 8: Lead Deduplication (Repeated Comments Update Existing Lead without Spamming)'
    );
  } catch (err: any) {
    assert(false, 'TEST 8: Lead Deduplication', err.message);
  }

  // --- TEST 9: Inbound Messenger Message Ingestion ---
  try {
    const messengerEvent = {
      platform: 'FACEBOOK' as const,
      type: 'DIRECT_MESSAGE' as const,
      externalPageId: testPageId,
      externalInteractionId: `mid_test_${Date.now()}`,
      externalUserId: 'fb_user_dm_004',
      authorName: 'Ernesto Valenzuela',
      content: 'Hola, buenas tardes, tienen envíos a domicilio?',
      occurredAt: new Date(),
      rawPayload: {},
    };

    const dmResult = await SocialInteractionService.processEvent(messengerEvent);

    assert(
      dmResult.success === true &&
        typeof dmResult.conversationId === 'number' &&
        typeof dmResult.messageId === 'number',
      'TEST 9: Messenger Inbound Direct Message creates Conversation and Message'
    );
  } catch (err: any) {
    assert(false, 'TEST 9: Messenger Inbound Direct Message', err.message);
  }

  // --- TEST 10: Multi-Tenant Security & Unrecognized Page Rejection ---
  try {
    const unknownPageEvent = {
      platform: 'FACEBOOK' as const,
      type: 'COMMENT' as const,
      externalPageId: '999999999999999_unknown_page',
      externalInteractionId: `comment_unknown_${Date.now()}`,
      externalUserId: 'fb_user_unknown',
      content: 'Comentario en página ajena',
      occurredAt: new Date(),
      rawPayload: {},
    };

    const unknownResult = await SocialInteractionService.processEvent(unknownPageEvent);
    assert(
      unknownResult.success === false &&
        unknownResult.reason?.includes('no está registrada en ningún Workspace'),
      'TEST 10: Multi-Tenant Security (Unrecognized Meta Page ID Rejected Cleanly)'
    );
  } catch (err: any) {
    assert(false, 'TEST 10: Multi-Tenant Security', err.message);
  }

  console.log('\n====================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error during test suite:', err);
    process.exit(1);
  });
