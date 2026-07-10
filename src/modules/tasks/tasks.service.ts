/**
 * TASKS SERVICE  (src/modules/tasks/tasks.service.ts)
 *
 * The most complex service — covers:
 *   - List with 7 filters + full-text search + enum-aware sorting + pagination
 *   - Get single task with comments + recent activity (3 parallel queries)
 *   - Create task (TRANSACTION: insert task + activityLog atomically)
 *   - Update task (optimistic concurrency + change detection + TRANSACTION)
 *   - Delete task soft-delete (TRANSACTION: mark deleted + log activity)
 *   - Bulk update (TRANSACTION: verify all exist → update all → log all, all-or-nothing)
 *
 * KEY CONCEPT — DRIZZLE TRANSACTIONS:
 *   db.transaction(async (tx) => { ... })
 *   `tx` is a transaction-scoped DB client. Every insert/update done through `tx`
 *   is part of the SAME PostgreSQL transaction. If anything throws inside the
 *   callback, Drizzle automatically issues a ROLLBACK — nothing is persisted.
 *   On success it issues COMMIT — everything is persisted atomically.
 */
import { SQL, and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { activityLog, comments, projects, tasks } from '../../db/schema/index.js';
import { AppError } from '../../lib/errors.js';
import type {
  BulkUpdateTaskInput,
  CreateTaskInput,
  ListTasksInput,
  UpdateTaskInput,
} from './tasks.schema.js';

// ─── List Tasks ───────────────────────────────────────────────────────────────
/**
 * Builds a dynamic WHERE clause from optional filters.
 *
 * ORG ISOLATION via subquery:
 *   Instead of joining projects in every query, we use:
 *     WHERE tasks.project_id IN (SELECT id FROM projects WHERE org_id = $orgId)
 *   This is a correlated subquery — PostgreSQL evaluates it once and uses the
 *   index on projects.org_id. Clean and performant.
 *
 * FULL-TEXT SEARCH:
 *   The `searchVector` tsvector column was built from title + description on write.
 *   `plainto_tsquery` turns a plain string like "fix login" into a tsquery
 *   and @@ is the "matches" operator. PostgreSQL uses the GIN index we defined.
 *
 * ENUM SORT:
 *   SQL ORDER BY on enum columns uses alphabetical order (wrong for priority/status).
 *   We use a CASE expression to assign numeric weights for logical ordering.
 */
export async function listTasks(orgId: string, input: ListTasksInput) {
  const { page, limit, sortBy, order, search, ...filters } = input;
  const offset = (page - 1) * limit;

  // Subquery: all project IDs belonging to this org
  const orgProjectIds = db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.orgId, orgId));

  // Build conditions dynamically — only add if the filter was provided
  // Type: SQL<unknown>[] so and() accepts them. filter(Boolean) removes undefined,
  // the 'as SQL[]' cast tells TypeScript the resulting array contains no undefined.
  const conditions: (SQL | undefined)[] = [
    isNull(tasks.deletedAt),
    inArray(tasks.projectId, orgProjectIds),
    filters.projectId   ? eq(tasks.projectId,  filters.projectId)            : undefined,
    filters.status      ? eq(tasks.status,      filters.status)               : undefined,
    filters.priority    ? eq(tasks.priority,    filters.priority)             : undefined,
    filters.assigneeId  ? eq(tasks.assigneeId,  filters.assigneeId)          : undefined,
    filters.dueDateFrom ? gte(tasks.dueDate, new Date(filters.dueDateFrom))   : undefined,
    filters.dueDateTo   ? lte(tasks.dueDate, new Date(filters.dueDateTo))     : undefined,
    search              ? sql`${tasks.searchVector} @@ plainto_tsquery('english', ${search})` : undefined,
  ];

  const where = and(...conditions);

  // Build ORDER BY expression
  // priority / status need CASE because enum alphabetical order != logical order
  let orderExpr;
  if (sortBy === 'priority') {
    const expr = sql`CASE ${tasks.priority}
      WHEN 'urgent' THEN 4 WHEN 'high' THEN 3
      WHEN 'medium' THEN 2 WHEN 'low'  THEN 1 END`;
    orderExpr = order === 'asc' ? asc(expr) : desc(expr);
  } else if (sortBy === 'status') {
    const expr = sql`CASE ${tasks.status}
      WHEN 'todo' THEN 1 WHEN 'in_progress' THEN 2
      WHEN 'done' THEN 3 WHEN 'archived'    THEN 4 END`;
    orderExpr = order === 'asc' ? asc(expr) : desc(expr);
  } else if (sortBy === 'dueDate') {
    orderExpr = order === 'asc' ? asc(tasks.dueDate) : desc(tasks.dueDate);
  } else {
    orderExpr = order === 'asc' ? asc(tasks.createdAt) : desc(tasks.createdAt);
  }

  // Run data + count queries in parallel
  const [rows, [countRow]] = await Promise.all([
    db.select().from(tasks).where(where).orderBy(orderExpr).limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(tasks).where(where),
  ]);

  return {
    data:       rows,
    total:      countRow?.total ?? 0,
    page,
    limit,
    totalPages: Math.ceil((countRow?.total ?? 0) / limit),
  };
}

// ─── Get Task (with comments + recent activity) ───────────────────────────────
/**
 * Three parallel queries:
 *   1. The task itself
 *   2. 10 most recent comments (not deleted)
 *   3. 10 most recent activity log entries
 *
 * Promise.all() fires all three at the same time — much faster than sequential.
 * Org isolation: verify task's project belongs to caller's org.
 */
export async function getTask(id: string, orgId: string) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)));

  if (!task) throw new AppError('NOT_FOUND', 'Task not found', 404);

  // Org isolation check
  const [project] = await db
    .select({ orgId: projects.orgId })
    .from(projects)
    .where(eq(projects.id, task.projectId));

  if (!project || project.orgId !== orgId) {
    throw new AppError('FORBIDDEN', 'Access denied', 403);
  }

  const [recentComments, recentActivity] = await Promise.all([
    db.select()
      .from(comments)
      .where(and(eq(comments.taskId, id), isNull(comments.deletedAt)))
      .orderBy(desc(comments.createdAt))
      .limit(10),

    db.select()
      .from(activityLog)
      .where(eq(activityLog.taskId, id))
      .orderBy(desc(activityLog.createdAt))
      .limit(10),
  ]);

  return { ...task, comments: recentComments, recentActivity };
}

// ─── Create Task (TRANSACTION: task insert + activity log) ────────────────────
/**
 * TRANSACTION EXPLAINED:
 *   We need BOTH the task row AND the activity log row to be created, or NEITHER.
 *   Without a transaction: if the activityLog insert fails after the task was
 *   already inserted, we'd have a task with no creation record — data inconsistency.
 *   With a transaction: Drizzle issues ROLLBACK on any failure — atomicity guaranteed.
 *
 * SEARCH VECTOR:
 *   to_tsvector('english', title || ' ' || description) builds the tsvector at
 *   write time. PostgreSQL tokenises and stems the words (e.g. 'running' → 'run').
 *   The GIN index makes future @@ searches fast.
 */
export async function createTask(input: CreateTaskInput, userId: string) {
  return await db.transaction(async (tx) => {
    const [task] = await tx
      .insert(tasks)
      .values({
        projectId:    input.projectId,
        title:        input.title,
        description:  input.description,
        assigneeId:   input.assigneeId,
        status:       input.status   ?? 'todo',
        priority:     input.priority ?? 'medium',
        dueDate:      input.dueDate  ? new Date(input.dueDate) : undefined,
        // Build the search vector from title + description
        searchVector: sql`to_tsvector('english', ${input.title} || ' ' || coalesce(${input.description ?? ''}, ''))` as unknown as string,
      })
      .returning();

    // Activity log written IN THE SAME TRANSACTION — atomic with task insert
    await tx.insert(activityLog).values({
      taskId:   task!.id,
      userId,
      action:   'TASK_CREATED',
      metadata: { title: task!.title, projectId: task!.projectId },
    });

    return task!;
  });
}

// ─── Update Task (optimistic concurrency + change tracking + TRANSACTION) ──────
/**
 * OPTIMISTIC CONCURRENCY:
 *   Client sends the version it last saw. If DB version differs, someone else
 *   updated concurrently → 409 Conflict. Client must refresh and retry.
 *
 * CHANGE DETECTION:
 *   We compare each input field against the existing value. Only changed fields
 *   are recorded in the activity log metadata. This gives a full audit trail:
 *   { changes: { status: { from: 'todo', to: 'in_progress' }, priority: { from: 'low', to: 'high' } } }
 *
 * TRANSACTION:
 *   Update + activityLog are atomic. Partial writes are impossible.
 */
export async function updateTask(
  id: string,
  orgId: string,
  input: UpdateTaskInput,
  userId: string,
) {
  const [existing] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)));

  if (!existing) throw new AppError('NOT_FOUND', 'Task not found', 404);

  // Org access check
  const [project] = await db
    .select({ orgId: projects.orgId })
    .from(projects)
    .where(eq(projects.id, existing.projectId));

  if (!project || project.orgId !== orgId) {
    throw new AppError('FORBIDDEN', 'Access denied', 403);
  }

  // Version mismatch → concurrent modification detected
  if (input.version !== existing.version) {
    throw new AppError(
      'VERSION_CONFLICT',
      'Task was modified by someone else. Refresh and try again.',
      409,
    );
  }

  // Detect what actually changed — stored as metadata in the activity log
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (input.status     !== undefined && input.status     !== existing.status)     changes.status     = { from: existing.status,     to: input.status };
  if (input.priority   !== undefined && input.priority   !== existing.priority)   changes.priority   = { from: existing.priority,   to: input.priority };
  if (input.title      !== undefined && input.title      !== existing.title)      changes.title      = { from: existing.title,      to: input.title };
  if (input.assigneeId !== undefined && input.assigneeId !== existing.assigneeId) changes.assigneeId = { from: existing.assigneeId, to: input.assigneeId };

  const newTitle       = input.title       ?? existing.title;
  const newDescription = input.description !== undefined ? input.description : existing.description;

  return await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tasks)
      .set({
        title:       newTitle,
        description: newDescription,
        status:      input.status    ?? existing.status,
        priority:    input.priority  ?? existing.priority,
        // undefined = unchanged, null = explicitly cleared (unassign/remove date)
        assigneeId:  input.assigneeId !== undefined ? input.assigneeId : existing.assigneeId,
        dueDate:     input.dueDate    !== undefined
          ? (input.dueDate ? new Date(input.dueDate) : null)
          : existing.dueDate,
        version:     existing.version + 1,
        updatedAt:   new Date(),
        // Rebuild search vector whenever task is updated (title or description may have changed)
        searchVector: sql`to_tsvector('english', ${newTitle} || ' ' || coalesce(${newDescription ?? ''}, ''))` as unknown as string,
      })
      .where(eq(tasks.id, id))
      .returning();

    // Only log if something actually changed
    if (Object.keys(changes).length > 0) {
      await tx.insert(activityLog).values({
        taskId:   id,
        userId,
        action:   'TASK_UPDATED',
        metadata: { changes },
      });
    }

    return updated!;
  });
}

// ─── Delete Task (soft delete + activity log — TRANSACTION) ───────────────────
export async function deleteTask(id: string, orgId: string, userId: string) {
  const [existing] = await db
    .select({ id: tasks.id, projectId: tasks.projectId })
    .from(tasks)
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)));

  if (!existing) throw new AppError('NOT_FOUND', 'Task not found', 404);

  const [project] = await db
    .select({ orgId: projects.orgId })
    .from(projects)
    .where(eq(projects.id, existing.projectId));

  if (!project || project.orgId !== orgId) {
    throw new AppError('FORBIDDEN', 'Access denied', 403);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(tasks.id, id));

    await tx.insert(activityLog).values({
      taskId:   id,
      userId,
      action:   'TASK_DELETED',
      metadata: {},
    });
  });
}

// ─── Bulk Update Tasks (ALL-OR-NOTHING TRANSACTION) ───────────────────────────
/**
 * ALL-OR-NOTHING SEMANTICS:
 *   The entire operation is one transaction. If ANY task ID is invalid / not found
 *   / belongs to another org, the AppError thrown inside the callback causes
 *   Drizzle to ROLLBACK — ZERO tasks are updated.
 *
 * EFFICIENCY:
 *   - ONE SELECT with inArray() to verify all IDs at once (not N round trips)
 *   - ONE UPDATE with inArray() to update all tasks at once
 *   - ONE INSERT for all activity log rows (bulk insert via values([...array]))
 *
 * VERSION INCREMENT:
 *   sql`${tasks.version} + 1` — a SQL expression that tells Postgres to read
 *   the current version and add 1 atomically. Safe even for concurrent updates
 *   within the same transaction batch.
 */
export async function bulkUpdateTasks(
  input: BulkUpdateTaskInput,
  orgId: string,
  userId: string,
) {
  return await db.transaction(async (tx) => {
    // Verify ALL tasks exist and belong to this org in ONE query
    const existing = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .innerJoin(
        projects,
        and(eq(tasks.projectId, projects.id), eq(projects.orgId, orgId)),
      )
      .where(and(inArray(tasks.id, input.ids), isNull(tasks.deletedAt)));

    // If counts don't match, some IDs were invalid → identify missing for error message
    if (existing.length !== input.ids.length) {
      const foundIds = new Set(existing.map((t) => t.id));
      const missing  = input.ids.filter((id) => !foundIds.has(id));
      throw new AppError(
        'NOT_FOUND',
        `Tasks not found or not accessible: ${missing.join(', ')}`,
        404,
      );
    }

    // Single UPDATE for all task IDs at once
    await tx
      .update(tasks)
      .set({
        ...(input.status     !== undefined ? { status:     input.status }     : {}),
        ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
        version:   sql`${tasks.version} + 1`,
        updatedAt: new Date(),
      })
      .where(inArray(tasks.id, input.ids));

    // Bulk-insert one activity log row per task in one round trip
    await tx.insert(activityLog).values(
      input.ids.map((taskId) => ({
        taskId,
        userId,
        action:   'BULK_UPDATE',
        metadata: {
          status:     input.status,
          assigneeId: input.assigneeId,
        },
      })),
    );

    return { updated: input.ids.length };
  });
}
