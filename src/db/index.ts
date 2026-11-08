import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    const poolConfig: any = {
      max: 10,
      min: 0,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 15000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    };

    if (process.env.DATABASE_URL) {
      poolConfig.connectionString = process.env.DATABASE_URL;
    } else {
      poolConfig.host = process.env.SQL_HOST || '127.0.0.1';
      poolConfig.user = process.env.SQL_USER || 'postgres';
      poolConfig.password = String(process.env.SQL_PASSWORD ?? '');
      poolConfig.database = process.env.SQL_DB_NAME || 'metacloser';
      if (process.env.SQL_PORT) {
        poolConfig.port = Number(process.env.SQL_PORT);
      }
    }

    global._postgresPool = new Pool(poolConfig);

    global._postgresPool.on('error', (err: any) => {
      // 57P01: admin_shutdown / terminating connection due to administrator command (Cloud SQL idle/restart)
      // ECONNRESET, EPIPE: Network socket reset on idle
      if (
        err?.code === '57P01' ||
        err?.code === 'ECONNRESET' ||
        err?.code === 'EPIPE' ||
        err?.message?.includes('terminating connection due to administrator command') ||
        err?.message?.includes('Connection terminated unexpectedly')
      ) {
        console.warn('[DB Pool] Idle connection closed by database server. Pool will reconnect on next query.');
      } else {
        console.error('[DB Pool] Unexpected error on SQL client:', err);
      }
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });
