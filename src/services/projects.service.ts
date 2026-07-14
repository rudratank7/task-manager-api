import * as projectRepo from '../repositories/project.repository.js';
import { AppError } from '../utils/errors.js';
import type { CreateProjectInput, UpdateProjectInput } from '../schemas/projects.schema.js';

// ─── List Projects ────────────────────────────────────────────────────────────
export async function listProjects(orgId: string, page: number, limit: number) {
  const offset = (page - 1) * limit;
  const { rows, total } = await projectRepo.findProjectsByOrg(orgId, limit, offset);
  return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ─── Get Project ──────────────────────────────────────────────────────────────
export async function getProject(id: string, orgId: string) {
  const project = await projectRepo.findProjectById(id, orgId);
  if (!project) throw new AppError('NOT_FOUND', 'Project not found', 404);

  const statusRows = await projectRepo.findTaskCountsByProject(id);
  const taskCounts = Object.fromEntries(statusRows.map((r) => [r.status, r.count]));
  return { ...project, taskCounts };
}

// ─── Create Project ───────────────────────────────────────────────────────────
export async function createProject(orgId: string, input: CreateProjectInput) {
  return projectRepo.insertProject(orgId, input.name, input.description);
}

// ─── Update Project ───────────────────────────────────────────────────────────
export async function updateProject(id: string, orgId: string, input: UpdateProjectInput) {
  const existing = await projectRepo.findProjectById(id, orgId);
  if (!existing) throw new AppError('NOT_FOUND', 'Project not found', 404);

  if (input.version !== existing.version) {
    throw new AppError('VERSION_CONFLICT', 'Project was modified by someone else. Refresh and try again.', 409);
  }

  return projectRepo.updateProjectById(id, {
    name:        input.name        ?? existing.name,
    description: input.description !== undefined ? input.description : existing.description,
    version:     existing.version + 1,
    updatedAt:   new Date(),
  });
}

// ─── Delete Project ───────────────────────────────────────────────────────────
export async function deleteProject(id: string, orgId: string) {
  const existing = await projectRepo.findProjectById(id, orgId);
  if (!existing) throw new AppError('NOT_FOUND', 'Project not found', 404);
  await projectRepo.softDeleteProject(id);
}
