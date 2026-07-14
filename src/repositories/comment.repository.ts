import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { activityLog, comments, tasks } from '../models/index.js';

/**
 * COMMENT REPOSITORY  (src/repositories/comment.repository.ts)
 *
 * All database access for comments and related activity logs.
 */

export async function findCommentsByTask(taskId: string, limit: number, offset: number) {
  const where = and(eq(comments.taskId, taskId), isNull(comments.deletedAt));
  const [rows, [countRow]] = await Promise.all([
    db.select().from(comments).where(where).orderBy(desc(comments.createdAt)).limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(comments).where(where),
  ]);
  return { rows, total: countRow?.total ?? 0 };
}

export async function findTaskExists(taskId: string) {
  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt)));
  return task ?? null;
}

export async function insertComment(taskId: string, authorId: string, body: string) {
  return await db.transaction(async (tx) => {
    const [comment] = await tx
      .insert(comments)
      .values({ taskId, authorId, body })
      .returning();

    await tx.insert(activityLog).values({
      taskId,
      userId: authorId,
      action: 'COMMENT_ADDED',
      metadata: { commentId: comment!.id },
    });

    return comment!;
  });
}

export async function findCommentById(id: string) {
  const [comment] = await db
    .select()
    .from(comments)
    .where(and(eq(comments.id, id), isNull(comments.deletedAt)));
  return comment ?? null;
}

export async function softDeleteComment(id: string) {
  await db
    .update(comments)
    .set({ deletedAt: new Date() })
    .where(eq(comments.id, id));
}
