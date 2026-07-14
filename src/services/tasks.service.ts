import { sql } from 'drizzle-orm';
import * as taskRepo from '../repositories/task.repository.js';
import { AppError } from '../utils/errors.js';
import type { BulkUpdateTaskInput, CreateTaskInput, ListTasksInput, UpdateTaskInput } from '../schemas/tasks.schema.js';

// ─── List Tasks ───────────────────────────────────────────────────────────────
export async function listTasks(orgId: string, input: ListTasksInput) {
  const { rows, total } = await taskRepo.findTasksByOrg(orgId, input);
  return { data: rows, total, page: input.page, limit: input.limit, totalPages: Math.ceil(total / input.limit) };
}

// ─── Get Task ─────────────────────────────────────────────────────────────────
export async function getTask(id: string, orgId: string) {
  const task = await taskRepo.findTaskById(id);
  if (!task) throw new AppError('NOT_FOUND', 'Task not found', 404);

  const projectOrgId = await taskRepo.findProjectOrgId(task.projectId);
  if (projectOrgId !== orgId) throw new AppError('FORBIDDEN', 'Access denied', 403);

  const { recentComments, recentActivity } = await taskRepo.findRecentCommentsAndActivity(id);
  return { ...task, comments: recentComments, recentActivity };
}

// ─── Create Task ──────────────────────────────────────────────────────────────
export async function createTask(input: CreateTaskInput, userId: string) {
  return taskRepo.insertTask({
    projectId:    input.projectId,
    title:        input.title,
    description:  input.description,
    assigneeId:   input.assigneeId,
    status:       input.status   ?? 'todo',
    priority:     input.priority ?? 'medium',
    dueDate:      input.dueDate ? new Date(input.dueDate) : undefined,
    searchVector: sql`to_tsvector('english', ${input.title} || ' ' || coalesce(${input.description ?? ''}, ''))`,
  }, userId);
}

// ─── Update Task ──────────────────────────────────────────────────────────────
export async function updateTask(id: string, orgId: string, input: UpdateTaskInput, userId: string) {
  const existing = await taskRepo.findTaskById(id);
  if (!existing) throw new AppError('NOT_FOUND', 'Task not found', 404);

  const projectOrgId = await taskRepo.findProjectOrgId(existing.projectId);
  if (projectOrgId !== orgId) throw new AppError('FORBIDDEN', 'Access denied', 403);

  if (input.version !== existing.version) {
    throw new AppError('VERSION_CONFLICT', 'Task was modified by someone else. Refresh and try again.', 409);
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (input.status     !== undefined && input.status     !== existing.status)     changes.status     = { from: existing.status,     to: input.status };
  if (input.priority   !== undefined && input.priority   !== existing.priority)   changes.priority   = { from: existing.priority,   to: input.priority };
  if (input.title      !== undefined && input.title      !== existing.title)      changes.title      = { from: existing.title,      to: input.title };
  if (input.assigneeId !== undefined && input.assigneeId !== existing.assigneeId) changes.assigneeId = { from: existing.assigneeId, to: input.assigneeId };

  const newTitle       = input.title       ?? existing.title;
  const newDescription = input.description !== undefined ? input.description : existing.description;

  return taskRepo.updateTaskById(id, {
    title:       newTitle,
    description: newDescription,
    status:      input.status    ?? existing.status,
    priority:    input.priority  ?? existing.priority,
    assigneeId:  input.assigneeId !== undefined ? input.assigneeId : existing.assigneeId,
    dueDate:     input.dueDate !== undefined ? (input.dueDate ? new Date(input.dueDate) : null) : existing.dueDate,
    version:     existing.version + 1,
    updatedAt:   new Date(),
    searchVector: sql`to_tsvector('english', ${newTitle} || ' ' || coalesce(${newDescription ?? ''}, ''))`,
  }, userId, changes);
}

// ─── Delete Task ──────────────────────────────────────────────────────────────
export async function deleteTask(id: string, orgId: string, userId: string) {
  const existing = await taskRepo.findTaskById(id);
  if (!existing) throw new AppError('NOT_FOUND', 'Task not found', 404);

  const projectOrgId = await taskRepo.findProjectOrgId(existing.projectId);
  if (projectOrgId !== orgId) throw new AppError('FORBIDDEN', 'Access denied', 403);

  await taskRepo.softDeleteTask(id, userId);
}

// ─── Bulk Update Tasks ────────────────────────────────────────────────────────
export async function bulkUpdateTasks(input: BulkUpdateTaskInput, orgId: string, userId: string) {
  const values: Record<string, unknown> = {};
  if (input.status     !== undefined) values.status     = input.status;
  if (input.assigneeId !== undefined) values.assigneeId = input.assigneeId;

  const result = await taskRepo.executeBulkUpdate(input.ids, orgId, values, userId, {
    status: input.status, assigneeId: input.assigneeId,
  });

  if (result.missing) {
    throw new AppError('NOT_FOUND', `Tasks not found or not accessible: ${result.missing.join(', ')}`, 404);
  }

  return { updated: input.ids.length };
}
