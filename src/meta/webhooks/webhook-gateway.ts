import http from 'node:http';
import express from 'express';
import { webhookRouter } from '../../routes/webhook.routes.ts';

/**
 * Webhook-only listener for running the CRM on a local PC.
 *
 * A tunnel (ngrok / Cloudflare Tunnel) points to THIS port, not to the CRM port, so the
 * internet can reach only the Meta webhook endpoints:
 *     GET/POST /api/webhooks/meta   -> verification + Messenger / WhatsApp / Instagram events
 *     GET      /health              -> "ok" (to check the tunnel)
 * Everything else answers 404. The CRM, leads and API stay private on the main port.
 *
 * Because it is reachable from the internet, it refuses to start unless Meta signature
 * verification (META_APP_SECRET) and the verify token (META_WEBHOOK_VERIFY_TOKEN) are set;
 * without them anyone could inject fake customer messages.
 */
export function startWebhookGateway(port: number): http.Server | null {
  const missing = ['META_APP_SECRET', 'META_WEBHOOK_VERIFY_TOKEN'].filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    console.error(
      `[Webhook gateway] NOT started: set ${missing.join(' and ')} in .env. ` +
        'Without them the public webhook would accept unsigned (fake) messages.'
    );
    return null;
  }

  const gateway = express();
  gateway.disable('x-powered-by');
  gateway.set('trust proxy', 1);
  gateway.use(
    express.json({
      limit: '5mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf; // needed for X-Hub-Signature-256 verification
      },
    })
  );
  gateway.get('/health', (_req, res) => res.type('text').send('ok'));
  gateway.use('/api/webhooks', webhookRouter);
  gateway.use((_req, res) => res.status(404).type('text').send('Not found'));

  const server = http.createServer(gateway);
  // Loopback only: the tunnel client runs on this same PC.
  server.listen(port, '127.0.0.1', () => {
    console.log(`[Webhook gateway] Meta webhooks on http://127.0.0.1:${port}/api/webhooks/meta (point your tunnel here)`);
  });
  server.on('error', (err: any) => {
    console.error(`[Webhook gateway] Could not listen on port ${port}:`, err?.message || err);
  });
  return server;
}
