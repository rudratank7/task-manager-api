/**
 * TASKS ZOD SCHEMAS  (src/modules/tasks/tasks.schema.ts)
 *
 * Covers all five tasks endpoints:
 *   GET /tasks           — listTasksSchema (query params)
 *   GET /tasks/:id       — taskParamsSchema
 *   POST /tasks          — createTaskSchema (body)
 *   PATCH /tasks/:id     — updateTaskSchema (body)
 *   PATCH /tasks/bulk    — bulkUpdateTaskSchema (body)
 */
import { z } from 'zod';

// Reusable enum values — match the pgEnum values exactly
const taskStatus   = z.enum(['todo', 'in_progress', 'done', 'archived']);
const taskPriority = z.enum(['low', 'medium', 'high', 'urgent']);

// ── GET /tasks query params ────────────────────────────────────────────────────
export const listTasksSchema = z.object({
  projectId:   z.string().uuid().optional(),
  status:      taskStatus.optional(),
  priority:    taskPriority.optional(),
  assigneeId:  z.string().uuid().optional(),
  // Date range filter: ISO strings from query params
  dueDateFrom: z.string().optional(),
  dueDateTo:   z.string().optional(),
  // Full-text search query
  search:      z.string().optional(),
  // Sort options
  sortBy:  z.enum(['createdAt', 'dueDate', 'priority', 'status']).default('createdAt'),
  order:   z.enum(['asc', 'desc']).default('desc'),
  // Pagination — coerce: query params are strings, coerce turns '20' → 20
  page:    z.coerce.number().int().min(1).default(1),
  limit:   z.coerce.number().int().min(1).max(100).default(20),
});

// ── Route params schema ────────────────────────────────────────────────────────
export const taskParamsSchema = z.object({
  id: z.string().uuid('Task ID must be a valid UUID'),
});

// ── POST /tasks body ───────────────────────────────────────────────────────────
export const createTaskSchema = z.object({
  projectId:   z.string().uuid('Must be a valid project UUID'),
  title:       z.string().min(1, 'Title is required').max(255),
  description: z.string().max(5000).optional(),
  assigneeId:  z.string().uuid().optional(),
  status:      taskStatus.optional(),
  priority:    taskPriority.optional(),
  // datetime({ offset: true }) → accepts '2024-01-01T00:00:00Z' and '...+05:30'
  dueDate:     z.string().datetime({ offset: true }).optional(),
});

// ── PATCH /tasks/:id body ──────────────────────────────────────────────────────
// All fields optional EXCEPT version (required for optimistic concurrency).
// nullable() on assigneeId/dueDate allows clearing them (set to null).
export const updateTaskSchema = z.object({
  title:       z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  assigneeId:  z.string().uuid().nullable().optional(),
  status:      taskStatus.optional(),
  priority:    taskPriority.optional(),
  dueDate:     z.string().datetime({ offset: true }).nullable().optional(),
  version:     z.number().int().positive('version is required for updates'),
});

// ── PATCH /tasks/bulk body ─────────────────────────────────────────────────────
// ids: 1–100 UUIDs. At least one of status/assigneeId must be provided.
export const bulkUpdateTaskSchema = z.object({
  ids:        z.array(z.string().uuid()).min(1, 'At least one task ID required').max(100),
  status:     taskStatus.optional(),
  assigneeId: z.string().uuid().nullable().optional(),
}).refine(
  (d) => d.status !== undefined || d.assigneeId !== undefined,
  { message: 'Provide at least one field to update: status or assigneeId' },
);

export type ListTasksInput      = z.infer<typeof listTasksSchema>;
export type CreateTaskInput     = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput     = z.infer<typeof updateTaskSchema>;
export type BulkUpdateTaskInput = z.infer<typeof bulkUpdateTaskSchema>;
