import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  listTasksSchema,
  taskParamsSchema,
  createTaskSchema,
  updateTaskSchema,
  bulkUpdateTaskSchema,
} from '../schemas/tasks.schema.js';
import * as tasksService from '../services/tasks.service.js';
import { validate } from '../middleware/validate.js';

export async function bulkUpdateTasks(request: FastifyRequest, reply: FastifyReply) {
  const b = validate(bulkUpdateTaskSchema, request.body, reply);
  if (!b.ok) return;

  const result = await tasksService.bulkUpdateTasks(
    b.data,
    request.user.orgId,
    request.user.sub,
  );
  return reply.send(result);
}

export async function listTasks(request: FastifyRequest, reply: FastifyReply) {
  const q = validate(listTasksSchema, request.query, reply);
  if (!q.ok) return;

  const result = await tasksService.listTasks(request.user.orgId, q.data);
  return reply.send(result);
}

export async function getTask(request: FastifyRequest, reply: FastifyReply) {
  const p = validate(taskParamsSchema, request.params, reply);
  if (!p.ok) return;

  const task = await tasksService.getTask(p.data.id, request.user.orgId);
  return reply.send(task);
}

export async function createTask(request: FastifyRequest, reply: FastifyReply) {
  const b = validate(createTaskSchema, request.body, reply);
  if (!b.ok) return;

  const task = await tasksService.createTask(b.data, request.user.sub);
  return reply.status(201).send(task);
}

export async function updateTask(request: FastifyRequest, reply: FastifyReply) {
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
}

export async function deleteTask(request: FastifyRequest, reply: FastifyReply) {
  const p = validate(taskParamsSchema, request.params, reply);
  if (!p.ok) return;

  await tasksService.deleteTask(p.data.id, request.user.orgId, request.user.sub);
  return reply.status(204).send();
}
