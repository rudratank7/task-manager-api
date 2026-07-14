import type { FastifyInstance } from 'fastify';
import * as taskController from '../../controllers/task.controller.js';

export async function taskRoutes(fastify: FastifyInstance) {
  fastify.patch('/bulk', {
    schema: { tags: ['Tasks'], summary: 'Bulk update status/assignee (all-or-nothing transaction)', security: [{ bearerAuth: [] }] },
  }, taskController.bulkUpdateTasks);

  fastify.get('/', {
    schema: { tags: ['Tasks'], summary: 'List tasks (7 filters + full-text search + sort + pagination)', security: [{ bearerAuth: [] }] },
  }, taskController.listTasks);

  fastify.get('/:id', {
    schema: { tags: ['Tasks'], summary: 'Get task with 10 recent comments + 10 recent activity entries', security: [{ bearerAuth: [] }] },
  }, taskController.getTask);

  fastify.post('/', {
    schema: { tags: ['Tasks'], summary: 'Create task (transaction: task + activity log)', security: [{ bearerAuth: [] }] },
  }, taskController.createTask);

  fastify.patch('/:id', {
    schema: { tags: ['Tasks'], summary: 'Update task (version required, logs changes atomically)', security: [{ bearerAuth: [] }] },
  }, taskController.updateTask);

  fastify.delete('/:id', {
    schema: { tags: ['Tasks'], summary: 'Soft-delete task + log activity (transaction)', security: [{ bearerAuth: [] }] },
  }, taskController.deleteTask);
}
