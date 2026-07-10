/**
 * JWT PLUGIN  (src/plugins/jwt.ts)
 *
 * WHAT IS A FASTIFY PLUGIN?
 * A Fastify plugin is a function that receives the `fastify` instance and
 * adds things to it — routes, decorators, hooks, other plugins, etc.
 * Plugins run ONCE at startup before any request comes in.
 *
 * WHY fastify-plugin (fp)?
 * By default Fastify ENCAPSULATES plugins — decorators added inside a plugin
 * are invisible outside that plugin's scope. `fp()` breaks encapsulation so
 * `fastify.authenticate` is visible to ALL routes everywhere. Think of `fp`
 * as saying "this plugin is global, not scoped".
 */

import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';

export const jwtPlugin = fp(async (fastify: FastifyInstance) => {

  // Register @fastify/jwt using our secret from .env
  // This adds:
  //   fastify.jwt.sign(payload)   — create a token
  //   fastify.jwt.verify(token)   — verify + decode a token
  //   reply.jwtSign(payload)      — async version on reply
  //   request.jwtVerify()         — async verify on request (reads Authorization header)
  await fastify.register(fastifyJwt, {
    secret: env.JWT_SECRET,
  });

  /**
   * AUTHENTICATE DECORATOR
   *
   * This is a reusable preHandler function. Routes that need authentication
   * will pass it like:
   *
   *   fastify.get('/protected', { preHandler: [fastify.authenticate] }, handler)
   *
   * It reads the `Authorization: Bearer <token>` header, verifies the JWT,
   * and populates `request.user` with the decoded payload.
   * If the token is missing or invalid, it immediately sends a 401.
   */
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
