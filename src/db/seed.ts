import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env';
import * as schema from './schema';

async function seed() {
  // ⚠️  SECURITY WARNING ─────────────────────────────────────────────────────
  // This seed script creates accounts with hardcoded credentials:
  //   admin@voxa.dev / admin123
  //   test@voxa.dev  / test123
  //
  // These are DEVELOPMENT/TEST credentials ONLY.
  // NEVER run this script against a production database.
  // Running it in production will:
  //   • expose a known admin account with a trivially guessable password
  //   • allow anyone with knowledge of these credentials to gain full admin access
  //
  // If you accidentally ran this in production:
  //   1. Immediately change the admin password via the admin panel or SQL
  //   2. Rotate all API keys and JWT secrets
  //   3. Review audit logs for unauthorised access
  // ──────────────────────────────────────────────────────────────────────────
  if (env.NODE_ENV === 'production') {
    console.error(
      '❌ SECURITY: Refusing to run seed script in NODE_ENV=production.\n' +
        '   This script creates accounts with hardcoded credentials.\n' +
        '   Set NODE_ENV=development or use a dedicated migration for production data.',
    );
    process.exit(1);
  }

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  console.log('🌱 Starting seed...');
  console.warn('⚠️  WARNING: Seeding with hardcoded credentials. DO NOT run this in production.');

  // ─── Admin user ─────────────────────────────────────────────────────────────
  const adminPasswordHash = await bcrypt.hash('admin123', 10);

  const [adminUser] = await db
    .insert(schema.users)
    .values({
      name: 'Admin Voxa',
      email: 'admin@voxa.dev',
      passwordHash: adminPasswordHash,
      role: 'admin',
      isActive: true,
    })
    .onConflictDoUpdate({
      target: schema.users.email,
      set: {
        passwordHash: adminPasswordHash,
        role: 'admin',
        isActive: true,
        updatedAt: new Date(),
      },
    })
    .returning();

  console.log(`✅ Admin user: admin@voxa.dev (id: ${adminUser?.id})`);

  // ─── Test user ───────────────────────────────────────────────────────────────
  const testPasswordHash = await bcrypt.hash('test123', 10);

  const [testUser] = await db
    .insert(schema.users)
    .values({
      name: 'Test User',
      email: 'test@voxa.dev',
      passwordHash: testPasswordHash,
      role: 'customer',
      isActive: true,
    })
    .onConflictDoUpdate({
      target: schema.users.email,
      set: {
        passwordHash: testPasswordHash,
        role: 'customer',
        isActive: true,
        updatedAt: new Date(),
      },
    })
    .returning();

  console.log(`✅ Test user: test@voxa.dev (id: ${testUser?.id})`);

  // ─── Basic subscription for test user ───────────────────────────────────────
  if (testUser) {
    const now = new Date();
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    // Check if subscription exists
    const [existingSub] = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, testUser.id))
      .limit(1);

    if (existingSub) {
      await db
        .update(schema.subscriptions)
        .set({
          tier: 'basic',
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: nextMonth,
          updatedAt: new Date(),
        })
        .where(eq(schema.subscriptions.id, existingSub.id));
    } else {
      await db.insert(schema.subscriptions).values({
        userId: testUser.id,
        tier: 'basic',
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: nextMonth,
      });
    }

    console.log('✅ Basic subscription created for test@voxa.dev');
  }

  await pool.end();
  console.log('\n🎉 Seed completed!');
  console.log('   admin@voxa.dev / admin123  (role: admin)');
  console.log('   test@voxa.dev  / test123   (role: customer, plan: basic)');
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
