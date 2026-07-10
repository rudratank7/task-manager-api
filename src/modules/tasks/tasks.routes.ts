/**
 * TASKS ROUTES  (src/modules/tasks/tasks.routes.ts)
 *
 * IMPORTANT — ROUTE REGISTRATION ORDER:
 * `PATCH /bulk` is registered BEFORE `PATCH /:id`.
 * In Fastify, static segments always beat parameterised segments, so
 * `PATCH /tasks/bulk` will NEVER be accidentally matched by `PATCH /tasks/:id`.
 * We still register it first as a safety net and for readability.
 */
import type { FastifyInstance } from 'fastify';
import {
  listTasksSchema,
  taskParamsSchema,
  createTaskSchema,
  updateTaskSchema,
  bulkUpdateTaskSchema,
} from './tasks.schema.js';
import * as tasksService from './tasks.service.js';
import { validate } from '../../lib/validate.js';

export async function tasksRoutes(fastify: FastifyInstance) {
  // Every route in this plugin requires a valid JWT
  fastify.addHook('preHandler', fastify.authenticate);

  // ── PATCH /tasks/bulk ──────────────────────────────────────────────────────
  // Registered FIRST — static 'bulk' segment beats dynamic ':id' in routing.
  // Updates status/assigneeId for multiple task IDs in one atomic transaction.
  // If ANY id is invalid → entire operation rolls back (all-or-nothing).
  fastify.patch('/bulk', {
    schema: { tags: ['Tasks'], summary: 'Bulk update status/assignee (all-or-nothing transaction)', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const b = validate(bulkUpdateTaskSchema, request.body, reply);
    if (!b.ok) return;

    const result = await tasksService.bulkUpdateTasks(
      b.data,
      request.user.orgId,
      request.user.sub,
    );
    return reply.send(result);
  });

  // ── GET /tasks ─────────────────────────────────────────────────────────────
  // Supports 7 filters + full-text search + sort + pagination.
  // All filter fields are optional — an empty query returns all org tasks.
  fastify.get('/', {
    schema: { tags: ['Tasks'], summary: 'List tasks (7 filters + full-text search + sort + pagination)', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const q = validate(listTasksSchema, request.query, reply);
    if (!q.ok) return;

    const result = await tasksService.listTasks(request.user.orgId, q.data);
    return reply.send(result);
  });

  // ── GET /tasks/:id ─────────────────────────────────────────────────────────
  // Returns the task + its 10 most recent comments + 10 most recent activity entries.
  fastify.get('/:id', {
    schema: { tags: ['Tasks'], summary: 'Get task with 10 recent comments + 10 recent activity entries', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const p = validate(taskParamsSchema, request.params, reply);
    if (!p.ok) return;

    const task = await tasksService.getTask(p.data.id, request.user.orgId);
    return reply.send(task);
  });

  // ── POST /tasks ────────────────────────────────────────────────────────────
  // Creates a task AND writes an activity log entry in a single transaction.
  fastify.post('/', {
    schema: { tags: ['Tasks'], summary: 'Create task (transaction: task + activity log)', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const b = validate(createTaskSchema, request.body, reply);
    if (!b.ok) return;

    const task = await tasksService.createTask(b.data, request.user.sub);
    return reply.status(201).send(task);
  });

  // ── PATCH /tasks/:id ───────────────────────────────────────────────────────
  // Updates task fields. Client must send current `version` (optimistic concurrency).
  // Changes are detected and recorded in the activity log (same transaction).
  fastify.patch('/:id', {
    schema: { tags: ['Tasks'], summary: 'Update task (version required, logs changes atomically)', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const p = validate(taskParamsSchema, request.params, reply);
    if (!p.ok) return;

    const b = validate(updateTaskSchema, request.body, reply);
    if (!b.ok) return;

    const task = await tasksService.updateTask(
      p.data.id,
      request.user.orgId,
      b.data,
      request.user.sub,
    );
    return reply.send(task);
  });

  // ── DELETE /tasks/:id ──────────────────────────────────────────────────────
  // Soft-deletes the task (sets deletedAt) AND logs the deletion in one transaction.
  fastify.delete('/:id', {
    schema: { tags: ['Tasks'], summary: 'Soft-delete task + log activity (transaction)', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const p = validate(taskParamsSchema, request.params, reply);
    if (!p.ok) return;

    await tasksService.deleteTask(p.data.id, request.user.orgId, request.user.sub);
    return reply.status(204).send();
  });
}
