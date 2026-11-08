import { validatePublicMediaUrl } from '../social/utils/url-validator';
import { SocialPublisherService } from '../social/services/social-publisher.service';
import { FacebookAdapter } from '../social/adapters/facebook.adapter';
import { InstagramAdapter } from '../social/adapters/instagram.adapter';
import { SocialAccountService } from '../social/services/social-account.service';
import { SocialPostService } from '../social/services/social-post.service';
import { db } from '../db/index';
import * as schema from '../db/schema';
import { eq, and } from 'drizzle-orm';

async function runMetaPublicationTestSuite() {
  console.log('====================================================');
  console.log('--- RUNNING META REAL PUBLICATION TEST SUITE ---');
  console.log('====================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  const workspaceIdA = 1;
  const workspaceIdB = 2;

  try {
    // ----------------------------------------------------
    // TEST 1: Public Media URL Validation (Anti-Localhost Safeguards)
    // ----------------------------------------------------
    const localhostCheck = validatePublicMediaUrl('http://localhost:3000/media/pic.jpg');
    assert(
      localhostCheck.isValid === false && localhostCheck.error?.includes('Meta no puede acceder a URLs locales'),
      '1.a. URLs de localhost son bloqueadas para evitar fallos con Meta'
    );

    const privateIpCheck = validatePublicMediaUrl('https://192.168.1.100/assets/banner.png');
    assert(
      privateIpCheck.isValid === false && privateIpCheck.error?.includes('redes privadas'),
      '1.b. IPs de redes privadas (192.168.x.x, 10.x.x.x) son rechazadas'
    );

    const publicUrlCheck = validatePublicMediaUrl('https://images.unsplash.com/photo-1557804506-669a67965ba0');
    assert(
      publicUrlCheck.isValid === true && publicUrlCheck.error === undefined,
      '1.c. URLs públicas HTTPS son validadas y permitidas'
    );

    // ----------------------------------------------------
    // TEST 2: Publisher Mode & Fail-Closed Behavior
    // ----------------------------------------------------
    const prevMode = process.env.SOCIAL_PUBLISHER_MODE;

    process.env.SOCIAL_PUBLISHER_MODE = 'mock';
    assert(SocialPublisherService.getPublisherMode() === 'mock', '2.a. Modo mock detectado correctamente');

    process.env.SOCIAL_PUBLISHER_MODE = 'meta';
    assert(SocialPublisherService.getPublisherMode() === 'meta', '2.b. Modo meta detectado correctamente');

    process.env.SOCIAL_PUBLISHER_MODE = 'invalid_unknown';
    let threwError = false;
    try {
      SocialPublisherService.getPublisherMode();
    } catch {
      threwError = true;
    }
    assert(threwError, '2.c. Fail-closed: modo desconocido lanza excepción de seguridad');

    // Restore mode
    process.env.SOCIAL_PUBLISHER_MODE = prevMode || 'mock';

    // ----------------------------------------------------
    // TEST 3: Facebook Adapter (Graph API v21.0 Feed / Photos)
    // ----------------------------------------------------
    const fbAdapter = new FacebookAdapter();

    // 3.a Empty validation check
    const emptyFbCheck = fbAdapter.validatePost({
      workspaceId: workspaceIdA,
      postId: 10,
      targetId: 1,
      platform: 'FACEBOOK',
      accountId: 1,
      accessToken: 'token',
      externalAccountId: 'fb_page_10',
      caption: '',
      contentType: 'TEXT',
      mediaAssets: [],
    });
    assert(emptyFbCheck.isValid === false, '3.a. FacebookAdapter exige texto o media');

    // 3.b Mock successful text post
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: any, opts: any) => {
      const urlStr = url.toString();
      if (urlStr.includes('/feed')) {
        return {
          ok: true,
          json: async () => ({ id: 'page_123_post_999' }),
        } as any;
      }
      if (urlStr.includes('/photos')) {
        return {
          ok: true,
          json: async () => ({ id: 'photo_id_1', post_id: 'page_123_post_photo_999' }),
        } as any;
      }
      return { ok: false, json: async () => ({ error: { message: 'Not found' } }) } as any;
    };

    const fbTextResult = await fbAdapter.publish({
      workspaceId: workspaceIdA,
      postId: 10,
      targetId: 1,
      platform: 'FACEBOOK',
      accountId: 1,
      accessToken: 'fb_token',
      externalAccountId: 'page_123',
      caption: 'Publicación de prueba Facebook',
      contentType: 'TEXT',
      mediaAssets: [],
    });

    assert(
      fbTextResult.success === true &&
        fbTextResult.externalPostId === 'page_123_post_999' &&
        fbTextResult.externalPostUrl?.includes('facebook.com/page_123_post_999'),
      '3.b. FacebookAdapter publica texto y genera permalink correcto'
    );

    // ----------------------------------------------------
    // TEST 4: Instagram Adapter (Media Container -> Media Publish)
    // ----------------------------------------------------
    const igAdapter = new InstagramAdapter();

    globalThis.fetch = async (url: any) => {
      const urlStr = url.toString();
      if (urlStr.includes('/media_publish')) {
        return {
          ok: true,
          json: async () => ({ id: 'ig_media_final_777' }),
        } as any;
      }
      if (urlStr.includes('/media')) {
        return {
          ok: true,
          json: async () => ({ id: 'ig_container_creation_444' }),
        } as any;
      }
      if (urlStr.includes('fields=permalink')) {
        return {
          ok: true,
          json: async () => ({ id: 'ig_media_final_777', permalink: 'https://instagram.com/p/CR123' }),
        } as any;
      }
      return { ok: false, json: async () => ({}) } as any;
    };

    const igResult = await igAdapter.publish({
      workspaceId: workspaceIdA,
      postId: 11,
      targetId: 2,
      platform: 'INSTAGRAM',
      accountId: 2,
      accessToken: 'ig_token',
      externalAccountId: 'ig_pro_user_55',
      caption: 'Lanzamiento exclusivo en Instagram',
      contentType: 'IMAGE',
      mediaAssets: [{ type: 'IMAGE', url: 'https://images.unsplash.com/photo-1557804506', position: 0 }],
    });

    assert(
      igResult.success === true &&
        igResult.externalPostId === 'ig_media_final_777' &&
        igResult.externalPostUrl === 'https://instagram.com/p/CR123',
      '4.a. InstagramAdapter ejecuta flujo de contenedor -> publicación -> permalink'
    );

    // Restore fetch
    globalThis.fetch = originalFetch;

    // ----------------------------------------------------
    // TEST 5: End-to-End Database & Idempotency Testing
    // ----------------------------------------------------
    // Create a test social account in DB for Workspace A
    const connectedAcc = await SocialAccountService.connectAccount({
      workspaceId: workspaceIdA,
      platform: 'FACEBOOK',
      externalAccountId: `fb_test_${Date.now()}`,
      name: 'Página Oficial Test CRM',
      username: 'test_crm_page',
      accessToken: 'mock_access_token_val_123',
    });

    // Create a social post
    const createdPost = await SocialPostService.createPost({
      workspaceId: workspaceIdA,
      title: 'Post de Verificación Fase 5',
      caption: 'Publicación real controlada desde CRM',
      contentType: 'TEXT',
      objective: 'AWARENESS',
      targetAccountIds: [connectedAcc.id],
      mediaAssets: [],
    });

    assert(createdPost.status === 'DRAFT', '5.a. Publicación creada inicialmente en estado DRAFT');

    // Execute publication in mock mode
    process.env.SOCIAL_PUBLISHER_MODE = 'mock';
    const publishResult = await SocialPublisherService.publishPost(workspaceIdA, createdPost.id);

    assert(
      publishResult.status === 'PUBLISHED' && publishResult.post.status === 'PUBLISHED',
      '5.b. Publicación ejecutada y estado actualizado a PUBLISHED'
    );

    assert(
      publishResult.results.length === 1 && publishResult.results[0].result.success === true,
      '5.c. Canal destino registrado con éxito y externalPostId generado'
    );

    // ----------------------------------------------------
    // TEST 6: Idempotency Protection (Cannot Re-publish PUBLISHED post)
    // ----------------------------------------------------
    let duplicateErrorCaught = false;
    try {
      await SocialPublisherService.publishPost(workspaceIdA, createdPost.id);
    } catch (err: any) {
      if (err.message.includes('ya fue publicada')) {
        duplicateErrorCaught = true;
      }
    }
    assert(duplicateErrorCaught, '6.a. Idempotencia: no se permite volver a publicar un post ya PUBLISHED');

    // ----------------------------------------------------
    // TEST 7: Workspace Isolation Check
    // ----------------------------------------------------
    let isolationError = false;
    try {
      // Workspace B attempts to publish Workspace A's post
      await SocialPublisherService.publishPost(workspaceIdB, createdPost.id);
    } catch (err: any) {
      if (err.message.includes('no encontrada')) {
        isolationError = true;
      }
    }
    assert(isolationError, '7.a. Aislamiento Multi-Tenant: Workspace B no puede publicar posts de Workspace A');

    // ----------------------------------------------------
    // TEST 8: CRM Activities Audit Verification
    // ----------------------------------------------------
    const loggedActivities = await db
      .select()
      .from(schema.activities)
      .where(
        and(
          eq(schema.activities.workspaceId, workspaceIdA),
          eq(schema.activities.title, 'SOCIAL_POST_PUBLISHED')
        )
      );

    assert(
      loggedActivities.length > 0,
      '8.a. Auditoría CRM: Evento SOCIAL_POST_PUBLISHED registrado en la tabla de actividades'
    );
  } catch (e: any) {
    console.error('Unexpected test exception:', e);
    failed++;
  }

  console.log('====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runMetaPublicationTestSuite();
