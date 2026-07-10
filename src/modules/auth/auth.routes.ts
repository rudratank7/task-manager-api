/**
 * AUTH ROUTES  (src/modules/auth/auth.routes.ts)
 *
 * WHAT THIS FILE DOES:
 * Defines the HTTP layer for auth. Each route:
 *   1. Validates the incoming request body with Zod
 *   2. Calls the service (which talks to the DB)
 *   3. Signs JWTs (access token) via @fastify/jwt
 *   4. Returns the HTTP response
 *
 * ROUTE REGISTRATION PATTERN:
 * We export an async function that receives the `fastify` instance.
 * In server.ts we call `fastify.register(authRoutes)` which runs this
 * function once at startup and registers all the routes.
 *
 * WHY prefix: '/auth'?
 * Fastify's `register` accepts a `prefix` option. Every route defined
 * inside this plugin automatically gets that prefix, so we write
 * '/register' here and it becomes POST /auth/register.
 */

import { FastifyInstance } from 'fastify';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
} from './auth.schema.js';
import * as authService from './auth.service.js';
import { AppError } from './auth.service.js';

export async function authRoutes(fastify: FastifyInstance) {

  // ── POST /auth/register ────────────────────────────────────────────────────
  /**
   * Creates a new organization and its first admin user.
   * Returns user info + access token + refresh token.
   *
   * FLOW:
   *   Body validation → register() transaction → sign access token → create refresh token
   *   → 201 response
   */
  fastify.post('/register', {
    schema: { tags: ['Auth'], summary: 'Register a new organization + admin user' },
  }, async (request, reply) => {
    // safeParse returns { success: true, data } or { success: false, error }
    // It does NOT throw — we decide what to do with failures ourselves.
    const result = registerSchema.safeParse(request.body);

    if (!result.success) {
      // 422 Unprocessable Entity — the body shape is wrong
      // result.error.issues is an array like:
      // [{ path: ['email'], message: 'Must be a valid email' }]
      return reply.status(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          issues: result.error.issues,
        },
      });
    }

    try {
      const { user, org } = await authService.register(result.data);

      // reply.jwtSign() signs a JWT using the secret from our jwtPlugin.
      // The payload becomes the decoded token body.
      // expiresIn: '15m' — access tokens are short-lived on purpose.
      // If stolen, they expire quickly. The refresh token is used to get new ones.
      const accessToken = await reply.jwtSign(
        { sub: user.id, role: user.role, orgId: user.orgId },
        { expiresIn: '15m' },
      );

      const refreshToken = await authService.createRefreshToken(user.id);

      return reply.status(201).send({
        user,
        org,
        accessToken,   // short-lived (15 min) — put in memory, not localStorage
        refreshToken,  // long-lived (7 days) — put in httpOnly cookie in production
      });
    } catch (err) {
      if (err instanceof AppError && err.code === 'EMAIL_TAKEN') {
        return reply.status(409).send({
          error: { code: 'EMAIL_TAKEN', message: err.message },
        });
      }
      throw err; // let Fastify's error handler deal with unexpected errors
    }
  });

  // ── POST /auth/login ───────────────────────────────────────────────────────
  /**
   * Authenticates an existing user.
   * Returns same token pair as register.
   *
   * FLOW:
   *   Body validation → login() → sign access token → create refresh token → 200
   */
  fastify.post('/login', {
    schema: { tags: ['Auth'], summary: 'Login and receive access + refresh tokens' },
  }, async (request, reply) => {
    const result = loginSchema.safeParse(request.body);

    if (!result.success) {
      return reply.status(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          issues: result.error.issues,
        },
      });
    }

    try {
      const user = await authService.login(result.data);

      const accessToken = await reply.jwtSign(
        { sub: user.id, role: user.role, orgId: user.orgId },
        { expiresIn: '15m' },
      );

      const refreshToken = await authService.createRefreshToken(user.id);

      return reply.send({ user, accessToken, refreshToken });
    } catch (err) {
      if (err instanceof AppError && err.code === 'INVALID_CREDENTIALS') {
        // 401 Unauthorized — wrong email or password
        // We use the same code for both to not reveal which one was wrong
        return reply.status(401).send({
          error: { code: 'INVALID_CREDENTIALS', message: err.message },
        });
      }
      throw err;
    }
  });

  // ── POST /auth/refresh ─────────────────────────────────────────────────────
  /**
   * Exchanges a valid refresh token for a new access + refresh token pair.
   * The old refresh token is immediately revoked (rotation).
   *
   * CLIENT USAGE:
   *   When a request returns 401, the client calls this endpoint with the
   *   stored refresh token, stores the new tokens, then retries the original request.
   *
   * FLOW:
   *   Body validation → rotateRefreshToken() → sign new access token → 200
   */
  fastify.post('/refresh', {
    schema: { tags: ['Auth'], summary: 'Rotate refresh token → new access + refresh token pair' },
  }, async (request, reply) => {
    const result = refreshSchema.safeParse(request.body);

    if (!result.success) {
      return reply.status(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          issues: result.error.issues,
        },
      });
    }

    try {
      const { user, newToken } = await authService.rotateRefreshToken(result.data.refreshToken);

      const accessToken = await reply.jwtSign(
        { sub: user.id, role: user.role, orgId: user.orgId },
        { expiresIn: '15m' },
      );

      return reply.send({ accessToken, refreshToken: newToken });
    } catch (err) {
      if (err instanceof AppError) {
        const statusMap: Record<string, number> = {
          INVALID_TOKEN: 401,
          TOKEN_REVOKED: 401,
          TOKEN_EXPIRED: 401,
        };
        const status = statusMap[err.code] ?? 400;
        return reply.status(status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });
}
