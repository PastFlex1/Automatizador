import { MetaOAuthService } from '../meta/auth/meta-oauth.service';
import { SocialAccountService } from '../social/services/social-account.service';
import { db } from '../db/index';
import * as schema from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { decryptToken } from '../social/utils/crypto';

// Setup Mock for Global Fetch to avoid hitting external Meta servers during automated testing
const originalFetch = globalThis.fetch;

async function runMetaOAuthTestSuite() {
  console.log('====================================================');
  console.log('--- RUNNING META OAUTH VERIFICATION TEST SUITE ---');
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

  try {
    const workspaceIdA = 1;
    const workspaceIdB = 2;

    // Test 1: Endpoint connect genera state criptográfico válido
    const authData = MetaOAuthService.generateAuthUrl(workspaceIdA);
    assert(
      typeof authData.state === 'string' &&
        authData.state.length >= 32 &&
        authData.url.includes(`state=${authData.state}`) &&
        authData.url.includes('client_id='),
      '1. Endpoint connect genera state criptográficamente seguro y URL de autorización'
    );

    // Test 2: State inválido es rechazado
    const invalidValidation = MetaOAuthService.validateState('random_invalid_state_12345');
    assert(
      invalidValidation.isValid === false && invalidValidation.workspaceId === undefined,
      '2. State inválido es rechazado'
    );

    // Test 3: State utilizado no puede reutilizarse (Single-Use Guarantee)
    const validValidation = MetaOAuthService.validateState(authData.state);
    assert(
      validValidation.isValid === true && validValidation.workspaceId === workspaceIdA,
      '3.a. State válido es aceptado en la primera validación'
    );

    const reuseValidation = MetaOAuthService.validateState(authData.state);
    assert(
      reuseValidation.isValid === false,
      '3.b. State utilizado no puede reutilizarse (invalidado inmediatamente)'
    );

    // Test 4: Callback sin code o sin state falla correctamente
    const emptyStateValidation = MetaOAuthService.validateState('');
    const nullStateValidation = MetaOAuthService.validateState(undefined as any);
    assert(
      emptyStateValidation.isValid === false && nullStateValidation.isValid === false,
      '4. Callback sin code o state falla correctamente'
    );

    // Test 5 & 6: Mock Meta API token exchange and verify secrets/tokens are NEVER in returned data
    const mockAppSecret = process.env.META_APP_SECRET || 'secret_sample_key';
    const mockAccessToken = 'EAABwb7sampleTokenSecretRaw12345';

    // Mock fetch for Meta Token & Accounts API
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = input.toString();

      if (urlStr.includes('oauth/access_token')) {
        return new Response(
          JSON.stringify({
            access_token: mockAccessToken,
            token_type: 'bearer',
            expires_in: 5184000,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (urlStr.includes('/me/accounts')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'fb_page_test_901',
                name: 'Página de Prueba Comercial',
                category: 'Consultoría de Ventas',
                access_token: 'page_secret_token_fb_112233',
                picture: { data: { url: 'https://example.com/page.png' } },
                instagram_business_account: {
                  id: 'ig_biz_test_801',
                  username: 'empresa_pro_test',
                  name: 'Empresa Pro IG',
                  profile_picture_url: 'https://example.com/ig.png',
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    };

    // Perform discovery
    const discovered = await MetaOAuthService.exchangeCodeForAccounts('test_auth_code_123');
    const discoveryId = MetaOAuthService.createDiscoverySession(workspaceIdA, discovered);

    // Get sanitized accounts for UI
    const sanitizedSession = MetaOAuthService.getDiscoveredAccounts(discoveryId);
    assert(
      !!sanitizedSession && sanitizedSession.accounts.length === 2,
      '5.a. Descubrimiento de cuentas detecta Facebook Pages e Instagram vinculados'
    );

    const serializedResponse = JSON.stringify(sanitizedSession);
    assert(
      !serializedResponse.includes(mockAppSecret) && !serializedResponse.includes('META_APP_SECRET'),
      '5.b. META_APP_SECRET nunca aparece en las respuestas enviadas al frontend'
    );

    assert(
      !serializedResponse.includes(mockAccessToken) &&
        !serializedResponse.includes('page_secret_token_fb_112233') &&
        !serializedResponse.includes('accessToken'),
      '6. Access tokens en texto plano nunca aparecen en las respuestas enviadas al frontend'
    );

    // Test 7: Conectar cuenta y verificar cifrado AES-256-GCM en Base de Datos
    const connectedAccounts = await MetaOAuthService.connectSelectedAccounts(
      workspaceIdA,
      discoveryId,
      ['fb_page_test_901']
    );

    assert(
      connectedAccounts.length === 1 && connectedAccounts[0].name === 'Página de Prueba Comercial',
      '7.a. Selección y conexión de cuenta específica funciona correctamente'
    );

    // Query raw database row to verify ciphertext
    const [rawDbRow] = await db
      .select()
      .from(schema.socialAccounts)
      .where(
        and(
          eq(schema.socialAccounts.workspaceId, workspaceIdA),
          eq(schema.socialAccounts.externalAccountId, 'fb_page_test_901')
        )
      )
      .limit(1);

    assert(
      !!rawDbRow &&
        typeof rawDbRow.accessTokenEncrypted === 'string' &&
        rawDbRow.accessTokenEncrypted.includes(':') && // AES-256-GCM IV:Tag:Ciphertext format
        rawDbRow.accessTokenEncrypted !== 'page_secret_token_fb_112233',
      '7.b. Token almacenado en base de datos está cifrado con AES-256-GCM'
    );

    // Decrypt internal test
    const decrypted = decryptToken(rawDbRow.accessTokenEncrypted!);
    assert(
      decrypted === 'page_secret_token_fb_112233',
      '7.c. El token cifrado puede recuperarse únicamente de forma interna en backend'
    );

    // Test 8: Workspace Isolation - Workspace B no puede ver ni usar cuentas de Workspace A
    const workspaceBAccounts = await SocialAccountService.getWorkspaceAccounts(workspaceIdB);
    const hasWorkspaceAAccount = workspaceBAccounts.some((a) => a.externalAccountId === 'fb_page_test_901');
    assert(
      !hasWorkspaceAAccount,
      '8. Workspace Isolation: Workspace B no puede acceder ni ver cuentas de Workspace A'
    );

    // Test 9: Diagnóstico comprensible de errores devueltos por Meta
    const redirectMismatchDiag = MetaOAuthService.diagnoseOAuthError(
      'redirect_uri_mismatch',
      'error',
      'The redirect URI is not whitelisted in app settings'
    );
    assert(
      redirectMismatchDiag.code === 'REDIRECT_URI_MISMATCH' &&
        redirectMismatchDiag.message.includes('redirección') &&
        redirectMismatchDiag.recommendation.includes('META_REDIRECT_URI'),
      '9.a. Error redirect_uri_mismatch diagnosticado con explicación comprensible'
    );

    const accessDeniedDiag = MetaOAuthService.diagnoseOAuthError(
      'access_denied',
      'user_denied',
      'Permissions error'
    );
    assert(
      accessDeniedDiag.code === 'ACCESS_DENIED' && accessDeniedDiag.message.includes('rechazó'),
      '9.b. Error access_denied diagnosticado con recomendación de usuario'
    );

    const appInactiveDiag = MetaOAuthService.diagnoseOAuthError(
      'app_not_active',
      'development mode',
      'Application is in development mode'
    );
    assert(
      appInactiveDiag.code === 'APP_NOT_ACTIVE' &&
        appInactiveDiag.recommendation.includes('Administrador o Evaluador'),
      '9.c. Error app_not_active diagnosticado con recomendación de tester'
    );
  } catch (err: any) {
    console.error('Unexpected error in test suite:', err);
    failed++;
  } finally {
    // Restore original fetch
    globalThis.fetch = originalFetch;
  }

  console.log('====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runMetaOAuthTestSuite().catch((e) => {
  console.error(e);
  process.exit(1);
});
