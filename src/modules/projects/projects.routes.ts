/**
 * PROJECTS ROUTES  (src/modules/projects/projects.routes.ts)
 *
 * HTTP LAYER ONLY — validates input, calls service, formats response.
 *
 * KEY PATTERNS HERE:
 *
 * 1. addHook('preHandler', fastify.authenticate)
 *    — Applied once at plugin level, ALL routes in this file require a valid JWT.
 *    — authenticate reads the Authorization header, verifies the token,
 *      and populates request.user = { sub, role, orgId }.
 *
 * 2. validate(schema, data, reply)
 *    — Returns { ok: false } and sends 422 if invalid.
 *    — Returns { ok: true, data } with the typed, validated data if valid.
 *    — After `if (!parsed.ok) return;` the rest of the handler is type-safe.
 *
 * 3. requireAdmin(request, reply)
 *    — Checks request.user.role === 'admin', sends 403 if not.
 *    — Admin-only: POST, PATCH, DELETE.
 *
 * 4. No try/catch needed for AppErrors
 *    — AppErrors thrown in the service bubble up to the global error handler
 *      registered in server.ts, which sends the structured { error: { code, message } }.
 */
import type { FastifyInstance } from 'fastify';
import {
  listProjectsSchema,
  projectParamsSchema,
  createProjectSchema,
  updateProjectSchema,
} from './projects.schema.js';
import * as projectsService from './projects.service.js';
import { validate, requireAdmin } from '../../lib/validate.js';

export async function projectsRoutes(fastify: FastifyInstance) {
  // Every route in this plugin requires a valid JWT
  fastify.addHook('preHandler', fastify.authenticate);

  // ── GET /projects ──────────────────────────────────────────────────────────
  // Paginated list of projects for the caller's org.
  // orgId comes from request.user (decoded JWT) — users only ever see their own org.
  fastify.get('/', {
    schema: { tags: ['Projects'], summary: 'List projects (paginated)', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const q = validate(listProjectsSchema, request.query, reply);
    if (!q.ok) return;

    const result = await projectsService.listProjects(
      request.user.orgId,
      q.data.page,
      q.data.limit,
    );
    return reply.send(result);
  });

  // ── GET /projects/:id ──────────────────────────────────────────────────────
  // Single project + taskCounts: { todo: N, in_progress: N, done: N, archived: N }
  fastify.get('/:id', {
    schema: { tags: ['Projects'], summary: 'Get project + task counts by status', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const p = validate(projectParamsSchema, request.params, reply);
    if (!p.ok) return;

    const project = await projectsService.getProject(p.data.id, request.user.orgId);
    return reply.send(project);
  });

  // ── POST /projects ─────────────────────────────────────────────────────────
  // Create a new project (admin only).
  fastify.post('/', {
    schema: { tags: ['Projects'], summary: 'Create project (admin only)', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const b = validate(createProjectSchema, request.body, reply);
    if (!b.ok) return;

    const project = await projectsService.createProject(request.user.orgId, b.data);
    return reply.status(201).send(project);
  });

  // ── PATCH /projects/:id ────────────────────────────────────────────────────
  // Update project name/description (admin only).
  // Client must send current `version` for optimistic concurrency.
  fastify.patch('/:id', {
    schema: { tags: ['Projects'], summary: 'Update project (admin only, version required)', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const p = validate(projectParamsSchema, request.params, reply);
    if (!p.ok) return;

    const b = validate(updateProjectSchema, request.body, reply);
    if (!b.ok) return;

    const project = await projectsService.updateProject(p.data.id, request.user.orgId, b.data);
    return reply.send(project);
  });

  // ── DELETE /projects/:id ───────────────────────────────────────────────────
  // Soft-delete the project (admin only). Returns 204 No Content.
  fastify.delete('/:id', {
    schema: { tags: ['Projects'], summary: 'Soft-delete project (admin only)', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const p = validate(projectParamsSchema, request.params, reply);
    if (!p.ok) return;

    await projectsService.deleteProject(p.data.id, request.user.orgId);
    return reply.status(204).send();
  });
}
