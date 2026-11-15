import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@/db';
import * as schema from '@/db/schema';

export const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: { enabled: true },
  trustedOrigins: [WEB_ORIGIN],
});
