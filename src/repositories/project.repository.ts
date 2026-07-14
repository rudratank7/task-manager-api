import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { projects, tasks } from '../models/index.js';

/**
 * PROJECT REPOSITORY  (src/repositories/project.repository.ts)
 *
 * All database access for projects lives here.
 * Services receive plain data back and apply business rules on top.
 */

export async function findProjectsByOrg(orgId: string, limit: number, offset: number) {
  const where = and(eq(projects.orgId, orgId), isNull(projects.deletedAt));
  const [rows, [countRow]] = await Promise.all([
    db.select().from(projects).where(where).orderBy(desc(projects.createdAt)).limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(projects).where(where),
  ]);
  return { rows, total: countRow?.total ?? 0 };
}

export async function findProjectById(id: string, orgId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.orgId, orgId), isNull(projects.deletedAt)));
  return project ?? null;
}

export async function findTaskCountsByProject(projectId: string) {
  return db
    .select({ status: tasks.status, count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
    .groupBy(tasks.status);
}

export async function insertProject(orgId: string, name: string, description?: string | null) {
  const [project] = await db
    .insert(projects)
    .values({ orgId, name, description })
    .returning();
  return project!;
}

export async function updateProjectById(
  id: string,
  values: { name?: string; description?: string | null; version: number; updatedAt: Date },
) {
  const [updated] = await db
    .update(projects)
    .set(values)
    .where(eq(projects.id, id))
    .returning();
  return updated!;
}

export async function softDeleteProject(id: string) {
  await db
    .update(projects)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(projects.id, id));
}
