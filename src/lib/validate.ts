/**
 * SHARED HELPERS  (src/lib/validate.ts)
 *
 * validate()      — runs Zod safeParse, sends 422 on failure, returns typed data on success.
 *                   Using safeParse (not parse) means Zod never throws — we control the response.
 *
 * requireAdmin()  — checks request.user.role from the decoded JWT, sends 403 if not admin.
 *                   Returns a boolean so routes can do: if (!requireAdmin(...)) return;
 */
import type { ZodSchema } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';

export function validate<T>(
  schema: ZodSchema<T>,
  data: unknown,
  reply: FastifyReply,
): { ok: true; data: T } | { ok: false } {
  const result = schema.safeParse(data);

  if (!result.success) {
    void reply.status(422).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        // issues is an array: [{ path: ['email'], message: 'Invalid email' }, ...]
        issues: result.error.issues,
      },
    });
    return { ok: false };
  }

  return { ok: true, data: result.data };
}

export function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  if (request.user.role !== 'admin') {
    void reply.status(403).send({
      error: { code: 'FORBIDDEN', message: 'Admin access required' },
    });
    return false;
  }
  return true;
}
