import 'dotenv/config';
import fs from 'fs';

async function generatePermanentToken(freshToken) {
  if (!freshToken) {
    console.error('Debes proporcionar un token recién generado de Graph API Explorer.');
    process.exit(1);
  }

  const appId = process.env.META_APP_ID || '1082267098117290';
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) { console.error('Falta META_APP_SECRET en .env'); process.exit(1); }
  const targetPageId = process.env.META_PAGE_ID || '1323037820891730';

  console.log('1. Intercambiando token temporal por Token de Larga Duración...');
  const exchangeUrl = 'https://graph.facebook.com/v21.0/oauth/access_token?' + new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: freshToken,
  });

  const exchangeRes = await fetch(exchangeUrl);
  const exchangeData = await exchangeRes.json();

  if (!exchangeRes.ok || exchangeData.error) {
    console.error('Error al extender token:', exchangeData.error || exchangeData);
    process.exit(1);
  }

  const longLivedUserToken = exchangeData.access_token;
  console.log('✅ Token de usuario extendido con éxito (60 días).');

  console.log('2. Obteniendo Token Permanente de la Página APM Inox...');
  const accountsUrl = `https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedUserToken}`;
  const accountsRes = await fetch(accountsUrl);
  const accountsData = await accountsRes.json();

  if (!accountsRes.ok || accountsData.error) {
    console.error('Error al obtener cuentas:', accountsData.error || accountsData);
    process.exit(1);
  }

  const page = (accountsData.data || []).find(
    (p) => p.id === targetPageId || p.name?.toLowerCase().includes('apm inox')
  ) || accountsData.data?.[0];

  if (!page || !page.access_token) {
    console.error('No se encontró la página APM inox 1 en las cuentas del usuario:', accountsData);
    process.exit(1);
  }

  const permanentPageToken = page.access_token;
  console.log(`✅ ¡Token Permanente obtenido para la Página "${page.name}" (ID: ${page.id})!`);

  // Verify expiration
  console.log('3. Verificando que sea PERMANENTE con Meta Debugger API...');
  const debugUrl = `https://graph.facebook.com/debug_token?input_token=${permanentPageToken}&access_token=${appId}|${appSecret}`;
  const debugRes = await fetch(debugUrl);
  const debugData = await debugRes.json();

  const isNeverExpiring = debugData.data?.expires_at === 0 || !debugData.data?.expires_at;
  console.log('Verificación de caducidad:', {
    expires_at: debugData.data?.expires_at,
    is_valid: debugData.data?.is_valid,
    permanent: isNeverExpiring ? 'SÍ (NUNCA EXPIRA)' : 'Temporal',
  });

  // Update .env
  let envContent = fs.readFileSync('.env', 'utf-8');
  envContent = envContent.replace(/META_PAGE_ACCESS_TOKEN="[^"]*"/, `META_PAGE_ACCESS_TOKEN="${permanentPageToken}"`);
  envContent = envContent.replace(/META_USER_ACCESS_TOKEN="[^"]*"/, `META_USER_ACCESS_TOKEN="${longLivedUserToken}"`);
  fs.writeFileSync('.env', envContent);

  console.log('🎉 ¡El archivo .env ha sido actualizado con el Token Permanente!');
  return permanentPageToken;
}

const argToken = process.argv[2];
if (argToken) {
  generatePermanentToken(argToken);
}
