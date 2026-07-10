/**
 * COMMENTS ROUTES  (src/modules/comments/comments.routes.ts)
 */
import type { FastifyInstance } from 'fastify';
import {
  listCommentsSchema,
  createCommentSchema,
  commentParamsSchema,
} from './comments.schema.js';
import * as commentsService from './comments.service.js';
import { validate } from '../../lib/validate.js';

export async function commentsRoutes(fastify: FastifyInstance) {
  // All comment routes require a valid JWT
  fastify.addHook('preHandler', fastify.authenticate);

  // ── GET /comments?taskId=xxx ───────────────────────────────────────────────
  // Returns paginated comments for a specific task.
  // taskId is validated as a UUID — if missing or malformed, returns 422.
  fastify.get('/', {
    schema: { tags: ['Comments'], summary: 'List comments for a task (paginated, ?taskId=uuid required)', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const q = validate(listCommentsSchema, request.query, reply);
    if (!q.ok) return;

    const result = await commentsService.listComments(q.data.taskId, q.data.page, q.data.limit);
    return reply.send(result);
  });

  // ── POST /comments ─────────────────────────────────────────────────────────
  // Creates a comment AND an activity log entry in one atomic transaction.
  // authorId is taken from request.user.sub (the JWT sub claim = user UUID).
  fastify.post('/', {
    schema: { tags: ['Comments'], summary: 'Add comment + log activity (transaction)', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const b = validate(createCommentSchema, request.body, reply);
    if (!b.ok) return;

    const comment = await commentsService.createComment(b.data, request.user.sub);
    return reply.status(201).send(comment);
  });

  // ── DELETE /comments/:id ───────────────────────────────────────────────────
  // Soft-deletes the comment.
  // Allowed: the comment's author OR any admin.
  // The service enforces this — the route just passes userId and userRole.
  fastify.delete('/:id', {
    schema: { tags: ['Comments'], summary: 'Soft-delete comment (author or admin only)', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const p = validate(commentParamsSchema, request.params, reply);
    if (!p.ok) return;

    await commentsService.deleteComment(p.data.id, request.user.sub, request.user.role);
    return reply.status(204).send();
  });
}
