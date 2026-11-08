import 'dotenv/config';

async function checkPages() {
  const token = process.argv[2] || process.env.META_USER_ACCESS_TOKEN;
  if (!token) { console.error('Falta META_USER_ACCESS_TOKEN en .env (o pásalo como argumento).'); process.exit(1); }
  const res = await fetch('https://graph.facebook.com/v21.0/me/accounts?fields=id,name,category,access_token&access_token=' + token);
  const data = await res.json();
  console.log('User Accounts (Pages):', JSON.stringify(data, null, 2));

  // Also check debug_token to see granted permissions
  const debugRes = await fetch(`https://graph.facebook.com/debug_token?input_token=${token}&access_token=${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`);
  console.log('Debug Token:', JSON.stringify(await debugRes.json(), null, 2));
}

checkPages().catch(console.error);
