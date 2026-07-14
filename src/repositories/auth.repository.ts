import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { organizations, users, refreshTokens } from '../models/index.js';

/**
 * AUTH REPOSITORY  (src/repositories/auth.repository.ts)
 *
 * Handles ALL database access for authentication.
 * Services call repository methods — never `db` directly.
 * This isolates DB logic so services focus purely on business rules.
 */

// ─── Users ────────────────────────────────────────────────────────────────────

export async function findUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return user ?? null;
}

export async function findUserById(id: string) {
  const [user] = await db
    .select({ id: users.id, role: users.role, orgId: users.orgId })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return user ?? null;
}

export async function createOrgAndAdminUser(
  orgName: string,
  email: string,
  passwordHash: string,
) {
  return await db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({ name: orgName })
      .returning();

    const [user] = await tx
      .insert(users)
      .values({ orgId: org!.id, email, passwordHash, role: 'admin' })
      .returning({
        id: users.id,
        email: users.email,
        role: users.role,
        orgId: users.orgId,
      });

    return { user: user!, org: { id: org!.id, name: org!.name } };
  });
}

// ─── Refresh Tokens ───────────────────────────────────────────────────────────

export async function findRefreshToken(token: string) {
  const [stored] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.token, token))
    .limit(1);
  return stored ?? null;
}

export async function insertRefreshToken(userId: string, token: string, expiresAt: Date) {
  await db.insert(refreshTokens).values({ userId, token, expiresAt });
}

export async function revokeAndRotateRefreshToken(
  oldTokenId: string,
  userId: string,
  newToken: string,
  expiresAt: Date,
) {
  return await db.transaction(async (tx) => {
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, oldTokenId));

    await tx.insert(refreshTokens).values({ userId, token: newToken, expiresAt });

    const [user] = await tx
      .select({ id: users.id, role: users.role, orgId: users.orgId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return { user: user! };
  });
}
