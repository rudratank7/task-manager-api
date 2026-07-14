import { FastifyRequest, FastifyReply } from 'fastify';
import { registerSchema, loginSchema, refreshSchema } from '../schemas/auth.schema.js';
import * as authService from '../services/auth.service.js';
import { AppError } from '../utils/errors.js';

export async function register(request: FastifyRequest, reply: FastifyReply) {
  const result = registerSchema.safeParse(request.body);

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
    const { user, org } = await authService.register(result.data);

    const accessToken = await reply.jwtSign(
      { sub: user.id, role: user.role, orgId: user.orgId },
      { expiresIn: '15m' },
    );

    const refreshToken = await authService.createRefreshToken(user.id);

    return reply.status(201).send({
      user,
      org,
      accessToken,
      refreshToken,
    });
  } catch (err) {
    if (err instanceof AppError && err.code === 'EMAIL_TAKEN') {
      return reply.status(409).send({
        error: { code: 'EMAIL_TAKEN', message: err.message },
      });
    }
    throw err;
  }
}

export async function login(request: FastifyRequest, reply: FastifyReply) {
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
      return reply.status(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: err.message },
      });
    }
    throw err;
  }
}

export async function refresh(request: FastifyRequest, reply: FastifyReply) {
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
}
