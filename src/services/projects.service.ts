/**
 * PROJECTS SERVICE  (src/modules/projects/projects.service.ts)
 *
 * Pure business logic — no HTTP, no Fastify. Just DB calls.
 * Routes call these functions → service returns data or throws AppError.
 * The global error handler in server.ts catches AppErrors automatically.
 */
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { projects, tasks } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import type { CreateProjectInput, UpdateProjectInput } from '../schemas/projects.schema.js';

// ─── List Projects (paginated) ────────────────────────────────────────────────
/**
 * Returns projects for the caller's org with pagination metadata.
 * Promise.all() runs both queries (data + count) IN PARALLEL — faster than awaiting one then the other.
 */
export async function listProjects(orgId: string, page: number, limit: number) {
  const offset = (page - 1) * limit;
  const where = and(eq(projects.orgId, orgId), isNull(projects.deletedAt));

  const [rows, [countRow]] = await Promise.all([
    db.select()
      .from(projects)
      .where(where)
      .orderBy(desc(projects.createdAt))
      .limit(limit)
      .offset(offset),

    db.select({ total: sql<number>`count(*)::int` })
      .from(projects)
      .where(where),
  ]);

  return {
    data: rows,
    total:      countRow?.total ?? 0,
    page,
    limit,
    totalPages: Math.ceil((countRow?.total ?? 0) / limit),
  };
}

// ─── Get Single Project (with task counts by status) ──────────────────────────
/**
 * Returns the project plus a taskCounts map:
 *   { todo: 4, in_progress: 2, done: 10, archived: 1 }
 *
 * GROUP BY + COUNT in one query — much faster than four separate count queries.
 */
export async function getProject(id: string, orgId: string) {
  const [project] = await db.select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.orgId, orgId), isNull(projects.deletedAt)));

  if (!project) throw new AppError('NOT_FOUND', 'Project not found', 404);

  // Aggregate task counts per status in a single GROUP BY query
  const statusRows = await db
    .select({
      status: tasks.status,
      count:  sql<number>`count(*)::int`,
    })
    .from(tasks)
    .where(and(eq(tasks.projectId, id), isNull(tasks.deletedAt)))
    .groupBy(tasks.status);

  // Convert array → object: [{ status:'todo', count:4 }] → { todo: 4 }
  const taskCounts = Object.fromEntries(statusRows.map((r) => [r.status, r.count]));

  return { ...project, taskCounts };
}

// ─── Create Project ───────────────────────────────────────────────────────────
export async function createProject(orgId: string, input: CreateProjectInput) {
  const [project] = await db
    .insert(projects)
    .values({ orgId, name: input.name, description: input.description })
    .returning(); // returning() → Postgres sends back the created row

  return project!;
}

// ─── Update Project ───────────────────────────────────────────────────────────
/**
 * OPTIMISTIC CONCURRENCY:
 * The client sends the `version` it last read. We compare it with the DB.
 * If they differ, another request already modified the project → 409 Conflict.
 * On success, we increment version so the next update can detect future conflicts.
 *
 * This prevents the "lost update" problem without locking rows.
 */
export async function updateProject(id: string, orgId: string, input: UpdateProjectInput) {
  const [existing] = await db.select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.orgId, orgId), isNull(projects.deletedAt)));

  if (!existing) throw new AppError('NOT_FOUND', 'Project not found', 404);

  if (input.version !== existing.version) {
    throw new AppError(
      'VERSION_CONFLICT',
      'Project was modified by someone else. Refresh and try again.',
      409,
    );
  }

  const [updated] = await db
    .update(projects)
    .set({
      name:        input.name        ?? existing.name,
      // undefined = not provided (keep old), null = explicitly cleared
      description: input.description !== undefined ? input.description : existing.description,
      version:     existing.version + 1,
      updatedAt:   new Date(),
    })
    .where(eq(projects.id, id))
    .returning();

  return updated!;
}

// ─── Delete Project (soft delete) ─────────────────────────────────────────────
/**
 * SOFT DELETE:
 * We never DELETE rows. We set deletedAt = now().
 * All list/get queries filter WHERE deleted_at IS NULL.
 * This preserves history, allows restore, and prevents foreign key errors
 * (tasks that reference this project still exist in the DB).
 */
export async function deleteProject(id: string, orgId: string) {
  const [existing] = await db.select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.orgId, orgId), isNull(projects.deletedAt)));

  if (!existing) throw new AppError('NOT_FOUND', 'Project not found', 404);

  await db
    .update(projects)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(projects.id, id));
}
