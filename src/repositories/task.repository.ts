import { SQL, and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { activityLog, comments, projects, tasks } from '../models/index.js';
import type { ListTasksInput } from '../schemas/tasks.schema.js';

/**
 * TASK REPOSITORY  (src/repositories/task.repository.ts)
 *
 * All database access for tasks and activity logs lives here.
 */

export async function findTasksByOrg(orgId: string, input: ListTasksInput) {
  const { page, limit, sortBy, order, search, ...filters } = input;
  const offset = (page - 1) * limit;

  const orgProjectIds = db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.orgId, orgId));

  const conditions: (SQL | undefined)[] = [
    isNull(tasks.deletedAt),
    inArray(tasks.projectId, orgProjectIds),
    filters.projectId  ? eq(tasks.projectId,  filters.projectId)           : undefined,
    filters.status     ? eq(tasks.status,      filters.status)              : undefined,
    filters.priority   ? eq(tasks.priority,    filters.priority)            : undefined,
    filters.assigneeId ? eq(tasks.assigneeId,  filters.assigneeId)         : undefined,
    filters.dueDateFrom ? gte(tasks.dueDate, new Date(filters.dueDateFrom)) : undefined,
    filters.dueDateTo   ? lte(tasks.dueDate, new Date(filters.dueDateTo))   : undefined,
    search ? sql`${tasks.searchVector} @@ plainto_tsquery('english', ${search})` : undefined,
  ];

  const where = and(...conditions);

  let orderExpr;
  if (sortBy === 'priority') {
    const expr = sql`CASE ${tasks.priority} WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 END`;
    orderExpr = order === 'asc' ? asc(expr) : desc(expr);
  } else if (sortBy === 'status') {
    const expr = sql`CASE ${tasks.status} WHEN 'todo' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'done' THEN 3 WHEN 'archived' THEN 4 END`;
    orderExpr = order === 'asc' ? asc(expr) : desc(expr);
  } else if (sortBy === 'dueDate') {
    orderExpr = order === 'asc' ? asc(tasks.dueDate) : desc(tasks.dueDate);
  } else {
    orderExpr = order === 'asc' ? asc(tasks.createdAt) : desc(tasks.createdAt);
  }

  const [rows, [countRow]] = await Promise.all([
    db.select().from(tasks).where(where).orderBy(orderExpr).limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(tasks).where(where),
  ]);

  return { rows, total: countRow?.total ?? 0 };
}

export async function findTaskById(id: string) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)));
  return task ?? null;
}

export async function findProjectOrgId(projectId: string) {
  const [project] = await db
    .select({ orgId: projects.orgId })
    .from(projects)
    .where(eq(projects.id, projectId));
  return project?.orgId ?? null;
}

export async function findRecentCommentsAndActivity(taskId: string) {
  const [recentComments, recentActivity] = await Promise.all([
    db.select().from(comments)
      .where(and(eq(comments.taskId, taskId), isNull(comments.deletedAt)))
      .orderBy(desc(comments.createdAt)).limit(10),
    db.select().from(activityLog)
      .where(eq(activityLog.taskId, taskId))
      .orderBy(desc(activityLog.createdAt)).limit(10),
  ]);
  return { recentComments, recentActivity };
}

export async function insertTask(values: {
  projectId: string;
  title: string;
  description?: string | null;
  assigneeId?: string | null;
  status: string;
  priority: string;
  dueDate?: Date | null;
  searchVector: unknown;
}, userId: string) {
  return await db.transaction(async (tx) => {
    const [task] = await tx.insert(tasks).values(values as never).returning();
    await tx.insert(activityLog).values({
      taskId: task!.id, userId, action: 'TASK_CREATED',
      metadata: { title: task!.title, projectId: task!.projectId },
    });
    return task!;
  });
}

export async function updateTaskById(
  id: string,
  values: Record<string, unknown>,
  userId: string,
  changes: Record<string, unknown>,
) {
  return await db.transaction(async (tx) => {
    const [updated] = await tx.update(tasks).set(values as never).where(eq(tasks.id, id)).returning();
    if (Object.keys(changes).length > 0) {
      await tx.insert(activityLog).values({
        taskId: id, userId, action: 'TASK_UPDATED', metadata: { changes },
      });
    }
    return updated!;
  });
}

export async function softDeleteTask(id: string, userId: string) {
  await db.transaction(async (tx) => {
    await tx.update(tasks).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(tasks.id, id));
    await tx.insert(activityLog).values({ taskId: id, userId, action: 'TASK_DELETED', metadata: {} });
  });
}

export async function bulkUpdateTasksByIds(
  ids: string[],
  orgId: string,
  values: Record<string, unknown>,
  userId: string,
  logMetadata: Record<string, unknown>,
) {
  return await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .innerJoin(projects, and(eq(tasks.projectId, projects.id), eq(projects.orgId, orgId)))
      .where(and(inArray(tasks.id, ids), isNull(tasks.deletedAt)));

    return { existing, tx };
  });
}

export async function executeBulkUpdate(
  ids: string[],
  orgId: string,
  values: Record<string, unknown>,
  userId: string,
  logMetadata: Record<string, unknown>,
) {
  return await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .innerJoin(projects, and(eq(tasks.projectId, projects.id), eq(projects.orgId, orgId)))
      .where(and(inArray(tasks.id, ids), isNull(tasks.deletedAt)));

    if (existing.length !== ids.length) {
      const foundIds = new Set(existing.map((t) => t.id));
      return { missing: ids.filter((id) => !foundIds.has(id)) };
    }

    await tx.update(tasks)
      .set({ ...values, version: sql`${tasks.version} + 1`, updatedAt: new Date() })
      .where(inArray(tasks.id, ids));

    await tx.insert(activityLog).values(
      ids.map((taskId) => ({ taskId, userId, action: 'BULK_UPDATE', metadata: logMetadata })),
    );

    return { missing: null };
  });
}
