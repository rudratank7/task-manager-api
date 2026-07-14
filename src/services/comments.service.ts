/**
 * COMMENTS SERVICE  (src/modules/comments/comments.service.ts)
 *
 * Three operations:
 *   listComments  — paginated, filtered to one task, excludes soft-deleted
 *   createComment — TRANSACTION: insert comment + activityLog atomically
 *   deleteComment — soft delete, author or admin only
 */
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { activityLog, comments, tasks } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import type { CreateCommentInput } from '../schemas/comments.schema.js';

// ─── List Comments (paginated) ────────────────────────────────────────────────
export async function listComments(taskId: string, page: number, limit: number) {
  const offset = (page - 1) * limit;
  const where  = and(eq(comments.taskId, taskId), isNull(comments.deletedAt));

  const [rows, [countRow]] = await Promise.all([
    db.select()
      .from(comments)
      .where(where)
      .orderBy(desc(comments.createdAt))
      .limit(limit)
      .offset(offset),

    db.select({ total: sql<number>`count(*)::int` })
      .from(comments)
      .where(where),
  ]);

  return {
    data:       rows,
    total:      countRow?.total ?? 0,
    page,
    limit,
    totalPages: Math.ceil((countRow?.total ?? 0) / limit),
  };
}

// ─── Create Comment (TRANSACTION: comment insert + activity log) ───────────────
/**
 * TRANSACTION: The comment and the activity log entry are inserted atomically.
 * If activityLog insert fails for any reason, the comment is rolled back too.
 * This ensures every comment always has a corresponding activity record.
 */
export async function createComment(input: CreateCommentInput, authorId: string) {
  // Verify the task exists and isn't soft-deleted before creating a comment on it
  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, input.taskId), isNull(tasks.deletedAt)));

  if (!task) throw new AppError('NOT_FOUND', 'Task not found', 404);

  return await db.transaction(async (tx) => {
    const [comment] = await tx
      .insert(comments)
      .values({ taskId: input.taskId, authorId, body: input.body })
      .returning();

    // Activity log written in the SAME transaction as the comment
    await tx.insert(activityLog).values({
      taskId:   input.taskId,
      userId:   authorId,
      action:   'COMMENT_ADDED',
      metadata: { commentId: comment!.id },
    });

    return comment!;
  });
}

// ─── Delete Comment (soft delete, author or admin only) ────────────────────────
/**
 * AUTHORISATION LOGIC:
 *   - If request.user.sub === comment.authorId  → author is deleting their own comment ✅
 *   - If request.user.role === 'admin'           → admin can delete any comment ✅
 *   - Otherwise                                  → 403 Forbidden
 *
 * SOFT DELETE: sets deletedAt = now(), the comment still exists in the DB
 * for auditing but is excluded from all list queries (WHERE deleted_at IS NULL).
 */
export async function deleteComment(id: string, userId: string, userRole: string) {
  const [existing] = await db
    .select()
    .from(comments)
    .where(and(eq(comments.id, id), isNull(comments.deletedAt)));

  if (!existing) throw new AppError('NOT_FOUND', 'Comment not found', 404);

  const isAuthor = existing.authorId === userId;
  const isAdmin  = userRole === 'admin';

  if (!isAuthor && !isAdmin) {
    throw new AppError('FORBIDDEN', 'You can only delete your own comments', 403);
  }

  await db
    .update(comments)
    .set({ deletedAt: new Date() })
    .where(eq(comments.id, id));
}
