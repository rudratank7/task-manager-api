import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  listProjectsSchema,
  projectParamsSchema,
  createProjectSchema,
  updateProjectSchema,
} from '../schemas/projects.schema.js';
import * as projectsService from '../services/projects.service.js';
import { validate, requireAdmin } from '../middleware/validate.js';

export async function listProjects(request: FastifyRequest, reply: FastifyReply) {
  const q = validate(listProjectsSchema, request.query, reply);
  if (!q.ok) return;

  const result = await projectsService.listProjects(
    request.user.orgId,
    q.data.page,
    q.data.limit,
  );
  return reply.send(result);
}

export async function getProject(request: FastifyRequest, reply: FastifyReply) {
  const p = validate(projectParamsSchema, request.params, reply);
  if (!p.ok) return;

  const project = await projectsService.getProject(p.data.id, request.user.orgId);
  return reply.send(project);
}

export async function createProject(request: FastifyRequest, reply: FastifyReply) {
  if (!requireAdmin(request, reply)) return;

  const b = validate(createProjectSchema, request.body, reply);
  if (!b.ok) return;

  const project = await projectsService.createProject(request.user.orgId, b.data);
  return reply.status(201).send(project);
}

export async function updateProject(request: FastifyRequest, reply: FastifyReply) {
  if (!requireAdmin(request, reply)) return;

  const p = validate(projectParamsSchema, request.params, reply);
  if (!p.ok) return;

  const b = validate(updateProjectSchema, request.body, reply);
  if (!b.ok) return;

  const project = await projectsService.updateProject(p.data.id, request.user.orgId, b.data);
  return reply.send(project);
}

export async function deleteProject(request: FastifyRequest, reply: FastifyReply) {
  if (!requireAdmin(request, reply)) return;

  const p = validate(projectParamsSchema, request.params, reply);
  if (!p.ok) return;

  await projectsService.deleteProject(p.data.id, request.user.orgId);
  return reply.status(204).send();
}
