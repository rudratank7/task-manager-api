import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';

/**
 * AUTH MIDDLEWARE  (src/middleware/auth.ts)
 *
 * Registers the JWT plugin globally and exposes `fastify.authenticate`
 * as a reusable preHandler hook. Any route that calls:
 *   fastify.addHook('preHandler', fastify.authenticate)
 * will require a valid Bearer token. On success, populates `request.user`.
 */
export const authMiddleware = fp(async (fastify: FastifyInstance) => {
  await fastify.register(fastifyJwt, {
    secret: env.JWT_SECRET,
  });

  fastify.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch {
        reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Invalid or missing token' },
        });
      }
    },
  );
});
