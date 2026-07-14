import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import * as authRepo from '../repositories/auth.repository.js';
import { AppError } from '../utils/errors.js';
import type { RegisterInput, LoginInput } from '../schemas/auth.schema.js';

// ─── Register ─────────────────────────────────────────────────────────────────
export async function register(input: RegisterInput) {
  const existing = await authRepo.findUserByEmail(input.email);
  if (existing) {
    throw new AppError('EMAIL_TAKEN', 'An account with this email already exists', 409);
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  return authRepo.createOrgAndAdminUser(input.orgName, input.email, passwordHash);
}

// ─── Login ────────────────────────────────────────────────────────────────────
export async function login(input: LoginInput) {
  const user = await authRepo.findUserByEmail(input.email);

  const DUMMY_HASH = '$2b$12$dummyhashtopreventtimingattacksXXXXXXXXXXXXXXXXXXXXXX';
  const passwordMatch = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !passwordMatch) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }

  return { id: user.id, email: user.email, role: user.role, orgId: user.orgId };
}

// ─── Create Refresh Token ─────────────────────────────────────────────────────
export async function createRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await authRepo.insertRefreshToken(userId, token, expiresAt);
  return token;
}

// ─── Rotate Refresh Token ─────────────────────────────────────────────────────
export async function rotateRefreshToken(oldToken: string) {
  const stored = await authRepo.findRefreshToken(oldToken);

  if (!stored)           throw new AppError('INVALID_TOKEN',  'Refresh token not found',    401);
  if (stored.revokedAt)  throw new AppError('TOKEN_REVOKED',  'Refresh token already used', 401);
  if (stored.expiresAt < new Date()) throw new AppError('TOKEN_EXPIRED', 'Refresh token has expired', 401);

  const newToken  = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const { user } = await authRepo.revokeAndRotateRefreshToken(stored.id, stored.userId, newToken, expiresAt);
  return { user, newToken };
}
