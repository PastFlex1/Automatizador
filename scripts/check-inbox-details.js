import 'dotenv/config';

async function run() {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  const pageId = process.env.META_PAGE_ID || '1323037820891730';

  console.log('Checking page ID:', pageId);

  // 1. Page details
  const pRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}?fields=id,name,category,tasks,instagram_business_account,connected_instagram_account&access_token=${token}`);
  const pData = await pRes.json();
  console.log('Page Data:', JSON.stringify(pData, null, 2));

  // 2. Messenger conversations (limit 10 with details)
  const mRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/conversations?fields=id,snippet,updated_time,unread_count,senders,can_reply&limit=10&access_token=${token}`);
  const mData = await mRes.json();
  console.log('\n--- Messenger Conversations (Top 10) ---');
  if (mData.data) {
    mData.data.forEach((c, idx) => {
      const sender = c.senders?.data?.find(s => s.id !== pageId);
      console.log(`[${idx+1}] ${sender?.name} (${sender?.id}) | Updated: ${c.updated_time} | Snippet: "${c.snippet}"`);
    });
  } else {
    console.log('Messenger conv error:', mData);
  }

  // 3. Instagram platform conversations
  const igRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/conversations?platform=instagram&access_token=${token}`);
  const igData = await igRes.json();
  console.log('\n--- Instagram Conversations ---');
  console.log(JSON.stringify(igData, null, 2));

  // 4. Check user account details (to see if messages are in the user profile vs page)
  const userToken = process.env.META_USER_ACCESS_TOKEN;
  if (userToken) {
    const meRes = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${userToken}`);
    console.log('\n--- User Token Me ---', await meRes.json());
  }
}

run().catch(console.error);
