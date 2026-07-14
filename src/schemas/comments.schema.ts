/**
 * COMMENTS ZOD SCHEMAS  (src/modules/comments/comments.schema.ts)
 */
import { z } from 'zod';

// ── GET /comments query params ─────────────────────────────────────────────────
// taskId is required — comments always belong to a specific task.
export const listCommentsSchema = z.object({
  taskId: z.string().uuid('taskId must be a valid UUID'),
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
});

// ── POST /comments body ────────────────────────────────────────────────────────
export const createCommentSchema = z.object({
  taskId: z.string().uuid('taskId must be a valid UUID'),
  body:   z.string().min(1, 'Comment body is required').max(10_000),
});

// ── DELETE /comments/:id params ────────────────────────────────────────────────
export const commentParamsSchema = z.object({
  id: z.string().uuid('Comment ID must be a valid UUID'),
});

export type ListCommentsInput  = z.infer<typeof listCommentsSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
