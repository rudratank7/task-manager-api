import type { FastifyInstance } from 'fastify';
import * as projectController from '../../controllers/project.controller.js';

export async function projectRoutes(fastify: FastifyInstance) {
  fastify.get('/', {
    schema: { tags: ['Projects'], summary: 'List projects (paginated)', security: [{ bearerAuth: [] }] },
  }, projectController.listProjects);

  fastify.get('/:id', {
    schema: { tags: ['Projects'], summary: 'Get project + task counts by status', security: [{ bearerAuth: [] }] },
  }, projectController.getProject);

  fastify.post('/', {
    schema: { tags: ['Projects'], summary: 'Create project (admin only)', security: [{ bearerAuth: [] }] },
  }, projectController.createProject);

  fastify.patch('/:id', {
    schema: { tags: ['Projects'], summary: 'Update project (admin only, version required)', security: [{ bearerAuth: [] }] },
  }, projectController.updateProject);

  fastify.delete('/:id', {
    schema: { tags: ['Projects'], summary: 'Soft-delete project (admin only)', security: [{ bearerAuth: [] }] },
  }, projectController.deleteProject);
}
