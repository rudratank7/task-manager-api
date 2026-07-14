import type { FastifyInstance } from 'fastify';
import * as commentController from '../../controllers/comment.controller.js';

export async function commentRoutes(fastify: FastifyInstance) {
  fastify.get('/', {
    schema: { tags: ['Comments'], summary: 'List comments for a task (paginated, ?taskId=uuid required)', security: [{ bearerAuth: [] }] },
  }, commentController.listComments);

  fastify.post('/', {
    schema: { tags: ['Comments'], summary: 'Add comment + log activity (transaction)', security: [{ bearerAuth: [] }] },
  }, commentController.createComment);

  fastify.delete('/:id', {
    schema: { tags: ['Comments'], summary: 'Soft-delete comment (author or admin only)', security: [{ bearerAuth: [] }] },
  }, commentController.deleteComment);
}
