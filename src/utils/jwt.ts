import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * JWT UTILS  (src/utils/jwt.ts)
 *
 * Thin wrappers around jsonwebtoken for signing and verifying
 * access and refresh tokens. Used by the auth service.
 */

export interface JwtPayload {
  sub: string;
  role: string;
  orgId: string;
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '15m' });
}

export function signRefreshToken(payload: { sub: string }): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as { sub: string };
}
