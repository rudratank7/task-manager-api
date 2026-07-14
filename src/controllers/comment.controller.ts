import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  listCommentsSchema,
  createCommentSchema,
  commentParamsSchema,
} from '../schemas/comments.schema.js';
import * as commentsService from '../services/comments.service.js';
import { validate } from '../middleware/validate.js';

export async function listComments(request: FastifyRequest, reply: FastifyReply) {
  const q = validate(listCommentsSchema, request.query, reply);
  if (!q.ok) return;

  const result = await commentsService.listComments(q.data.taskId, q.data.page, q.data.limit);
  return reply.send(result);
}

export async function createComment(request: FastifyRequest, reply: FastifyReply) {
  const b = validate(createCommentSchema, request.body, reply);
  if (!b.ok) return;

  const comment = await commentsService.createComment(b.data, request.user.sub);
  return reply.status(201).send(comment);
}

export async function deleteComment(request: FastifyRequest, reply: FastifyReply) {
  const p = validate(commentParamsSchema, request.params, reply);
  if (!p.ok) return;

  await commentsService.deleteComment(p.data.id, request.user.sub, request.user.role);
  return reply.status(204).send();
}
