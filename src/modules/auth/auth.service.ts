/**
 * AUTH SERVICE  (src/modules/auth/auth.service.ts)
 *
 * THE SERVICE LAYER — WHAT AND WHY:
 * A "service" holds the business logic. It doesn't know about HTTP at all.
 * It just receives plain data, talks to the database, and returns results (or throws errors).
 *
 * Routes call the service → service talks to DB → route turns the result into an HTTP response.
 * This separation means: you can test the service without running a server.
 *
 * PACKAGES USED:
 *   bcryptjs  — hashes passwords. bcrypt is a deliberately slow algorithm so brute-force
 *               attacks are expensive. Cost factor 12 = ~250ms per hash (good balance).
 *   crypto    — Node.js built-in module. We use it to generate cryptographically random
 *               refresh tokens (40 random bytes → 80 hex chars).
 */

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { organizations, users, refreshTokens } from '../../db/schema/index.js';
import type { RegisterInput, LoginInput } from './auth.schema.js';

// ─── Custom Error Codes ───────────────────────────────────────────────────────
// We throw plain Error objects with a `code` property so routes can handle
// specific failure cases without parsing error messages.
export class AppError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'AppError';
  }
}

// ─── REGISTER ─────────────────────────────────────────────────────────────────
/**
 * Creates a new Organization AND the first admin User in a single DB transaction.
 *
 * WHAT IS A TRANSACTION?
 * A transaction bundles multiple DB operations so they either ALL succeed
 * or ALL fail together. If the user insert fails after the org was created,
 * the org is automatically rolled back. This prevents orphaned data.
 *
 * FLOW:
 *   1. Check email not already used (globally — a simplification; see note below)
 *   2. Hash the password
 *   3. Transaction:
 *        a. INSERT into organizations → get org.id
 *        b. INSERT into users with that org.id, role = 'admin'
 *   4. Return { user, org } — the route will sign the JWT
 */
export async function register(input: RegisterInput) {
  // Global email uniqueness check.
  // NOTE: Our DB constraint is unique(email, orgId), meaning the same email
  // CAN exist in multiple orgs. For register we treat email globally unique
  // to keep login simple. In a real multi-tenant app you'd use org subdomains.
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (existing.length > 0) {
    throw new AppError('EMAIL_TAKEN', 'An account with this email already exists');
  }

  // Hash password — NEVER store plaintext passwords.
  // bcrypt automatically generates and embeds a random salt in the hash string.
  const passwordHash = await bcrypt.hash(input.password, 12);

  // db.transaction() gives us `tx` — a transaction-scoped DB client.
  // Any insert/update done through `tx` is part of the same transaction.
  return await db.transaction(async (tx) => {
    // Step 1: Create the organization
    const [org] = await tx
      .insert(organizations)
      .values({ name: input.orgName })
      .returning(); // .returning() tells Postgres to send back the inserted row

    // Step 2: Create the admin user inside that org
    const [user] = await tx
      .insert(users)
      .values({
        orgId: org.id,
        email: input.email,
        passwordHash,
        role: 'admin', // first user in a new org is always admin
      })
      .returning({
        id: users.id,
        email: users.email,
        role: users.role,
        orgId: users.orgId,
      });

    return { user, org: { id: org.id, name: org.name } };
  });
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
/**
 * Finds a user by email, verifies their password.
 *
 * SECURITY NOTE — timing attacks:
 * We always call bcrypt.compare even if the user doesn't exist (by comparing
 * against a dummy hash). This ensures the response time is the same whether
 * the email exists or not, preventing an attacker from enumerating valid emails
 * by measuring response speed.
 *
 * FLOW:
 *   1. Find user by email
 *   2. bcrypt.compare(inputPassword, storedHash) — returns true/false
 *   3. Return safe user fields (never return passwordHash)
 */
export async function login(input: LoginInput) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  // Dummy hash used when user is not found — prevents timing attacks
  const DUMMY_HASH = '$2b$12$dummyhashtopreventtimingattacksXXXXXXXXXXXXXXXXXXXXXX';
  const hashToCompare = user?.passwordHash ?? DUMMY_HASH;

  const passwordMatch = await bcrypt.compare(input.password, hashToCompare);

  // Use the same error for "user not found" and "wrong password"
  // — don't tell attackers which one it was
  if (!user || !passwordMatch) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password');
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    orgId: user.orgId,
  };
}

// ─── CREATE REFRESH TOKEN ─────────────────────────────────────────────────────
/**
 * Generates a new refresh token and stores it in the DB.
 *
 * WHY RANDOM BYTES AND NOT A JWT?
 * A refresh token in the DB acts as a "pointer" — we look it up, check it's
 * not revoked, then issue a new access token. Since it's stored server-side,
 * we can revoke it any time. A refresh JWT would be self-contained and
 * impossible to revoke before expiry without a blocklist.
 *
 * crypto.randomBytes(40) → 40 truly random bytes → .toString('hex') → 80 char string
 */
export async function createRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

  await db.insert(refreshTokens).values({ userId, token, expiresAt });

  return token; // This raw token is sent to the client
}

// ─── ROTATE REFRESH TOKEN ─────────────────────────────────────────────────────
/**
 * Implements refresh token rotation — the core security mechanism.
 *
 * WHAT IS TOKEN ROTATION?
 * Every time the client uses a refresh token, we:
 *   1. Immediately REVOKE the old token (mark revokedAt = now)
 *   2. Issue a BRAND NEW refresh token
 *
 * WHY? REUSE DETECTION:
 * If an attacker steals a refresh token and uses it, they get a new one.
 * But if the LEGITIMATE user then tries to use the (now revoked) original,
 * we KNOW there was a theft — both the stolen usage and the legitimate usage
 * are detected. We can revoke ALL tokens for that user as a response.
 *
 * FLOW:
 *   1. Find the token record by value
 *   2. Reject if: not found, already revoked, or past expiresAt
 *   3. Transaction:
 *        a. SET revokedAt = now on old token
 *        b. INSERT new token row
 *        c. Fetch user info (needed to sign new access token in the route)
 *   4. Return { user, newToken }
 */
export async function rotateRefreshToken(oldToken: string) {
  const [stored] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.token, oldToken))
    .limit(1);

  if (!stored) {
    throw new AppError('INVALID_TOKEN', 'Refresh token not found');
  }
  if (stored.revokedAt !== null) {
    // REUSE DETECTED — in production you'd revoke ALL tokens for this user here
    throw new AppError('TOKEN_REVOKED', 'Refresh token already used');
  }
  if (stored.expiresAt < new Date()) {
    throw new AppError('TOKEN_EXPIRED', 'Refresh token has expired');
  }

  return await db.transaction(async (tx) => {
    // Revoke the old token
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, stored.id));

    // Create a fresh replacement
    const newToken = crypto.randomBytes(40).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await tx.insert(refreshTokens).values({ userId: stored.userId, token: newToken, expiresAt });

    // Fetch user info so the route can sign a new access token
    const [user] = await tx
      .select({ id: users.id, role: users.role, orgId: users.orgId })
      .from(users)
      .where(eq(users.id, stored.userId))
      .limit(1);

    return { user, newToken };
  });
}
