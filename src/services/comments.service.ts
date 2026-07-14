import * as commentRepo from '../repositories/comment.repository.js';
import { AppError } from '../utils/errors.js';
import type { CreateCommentInput } from '../schemas/comments.schema.js';

// ─── List Comments ────────────────────────────────────────────────────────────
export async function listComments(taskId: string, page: number, limit: number) {
  const offset = (page - 1) * limit;
  const { rows, total } = await commentRepo.findCommentsByTask(taskId, limit, offset);
  return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ─── Create Comment ───────────────────────────────────────────────────────────
export async function createComment(input: CreateCommentInput, authorId: string) {
  const task = await commentRepo.findTaskExists(input.taskId);
  if (!task) throw new AppError('NOT_FOUND', 'Task not found', 404);

  return commentRepo.insertComment(input.taskId, authorId, input.body);
}

// ─── Delete Comment ───────────────────────────────────────────────────────────
export async function deleteComment(id: string, userId: string, userRole: string) {
  const existing = await commentRepo.findCommentById(id);
  if (!existing) throw new AppError('NOT_FOUND', 'Comment not found', 404);

  const isAuthor = existing.authorId === userId;
  const isAdmin  = userRole === 'admin';
  if (!isAuthor && !isAdmin) {
    throw new AppError('FORBIDDEN', 'You can only delete your own comments', 403);
  }

  await commentRepo.softDeleteComment(id);
}
