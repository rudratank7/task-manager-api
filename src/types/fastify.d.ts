/**
 * TYPE AUGMENTATION FILE
 *
 * WHY WE NEED THIS:
 * TypeScript doesn't know what shape our JWT payload has, or that `fastify.authenticate`
 * exists as a decorator. We tell it here so every file gets proper autocomplete + type safety.
 *
 * These declarations MERGE with the existing Fastify types — we're not replacing them.
 */

import { FastifyRequest, FastifyReply } from 'fastify';

// ─── JWT Payload Shape ────────────────────────────────────────────────────────
// Every access token we sign will have these three fields.
// `request.user` will be automatically typed to this after jwtVerify().
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;    // user UUID
      role: string;   // 'admin' | 'member' | 'viewer'
      orgId: string;  // organization UUID
    };
    user: {
      sub: string;
      role: string;
      orgId: string;
    };
  }
}

// ─── Fastify Instance Decorator ───────────────────────────────────────────────
// We add `authenticate` as a preHandler hook on our jwt plugin.
// Without this declaration, TypeScript would say "Property 'authenticate' does not exist".
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
