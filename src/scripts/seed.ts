/**
 * SEED SCRIPT  (src/scripts/seed.ts)
 *
 * Populates 200k+ rows across all tables in batches.
 *
 * DATA STRUCTURE:
 *   5 orgs
 *   └── 20 users each (1 admin, 4 members, 15 viewers)
 *   └── 10 projects each
 *       └── 250 tasks each   → 12,500 tasks total
 *           └── 10 comments  → 125,000 comments total
 *           └── 5 activity   → 62,500 activity logs total
 *   Total: ~200,155 rows  ✅ (> 100k requirement)
 *
 * BATCHING:
 *   Never build the full dataset in memory. We maintain a small buffer
 *   and flush (INSERT) it every BATCH_SIZE rows. This keeps memory flat
 *   regardless of total row count.
 *
 * SEARCH VECTOR:
 *   We skip `searchVector` during task inserts (faster bulk insert),
 *   then run ONE UPDATE at the end to populate all vectors at once.
 *   PostgreSQL does this faster in a single pass than row-by-row.
 *
 * RUN: npm run db:seed
 */
import '../config/env.js'; // must be first — loads .env before anything else
import { sql } from 'drizzle-orm';
import { faker } from '@faker-js/faker';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import {
  activityLog,
  comments,
  organizations,
  projects,
  refreshTokens,
  tasks,
  users,
} from '../db/schema/index.js';

// ─── Config ───────────────────────────────────────────────────────────────────
const CFG = {
  ORGS:                5,
  USERS_PER_ORG:      20,
  PROJECTS_PER_ORG:   10,
  TASKS_PER_PROJECT:  250,
  COMMENTS_PER_TASK:  10,
  ACTIVITY_PER_TASK:   5,
  TASK_BATCH:         500,   // tasks have more columns — keep batches smaller
  COMMENT_BATCH:     2000,
  ACTIVITY_BATCH:    2000,
};

const STATUSES  = ['todo', 'in_progress', 'done', 'archived'] as const;
const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const ACTIONS    = ['TASK_CREATED', 'TASK_UPDATED', 'COMMENT_ADDED', 'TASK_ASSIGNED'];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function progress(label: string, done: number, total: number) {
  process.stdout.write(`\r   ${label}: ${done.toLocaleString()} / ${total.toLocaleString()}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱  Seeding database...\n');
  const t0 = Date.now();

  // ── 1. Clear existing data (FK-safe order: leaf tables first) ────────────────
  console.log('🗑   Clearing existing data...');
  await db.delete(activityLog);
  await db.delete(comments);
  await db.delete(refreshTokens);
  await db.delete(tasks);
  await db.delete(projects);
  await db.delete(users);
  await db.delete(organizations);
  console.log('     Done.\n');

  // ── 2. Password hash — same for ALL users so you can log in easily ───────────
  console.log('🔑  Pre-hashing password (this takes ~250ms)...');
  const passwordHash = await bcrypt.hash('password123', 12);
  console.log('     Done. All users: password = "password123"\n');

  // ── 3. Organizations ─────────────────────────────────────────────────────────
  console.log(`🏢  Creating ${CFG.ORGS} organizations...`);
  const createdOrgs = await db
    .insert(organizations)
    .values(Array.from({ length: CFG.ORGS }, () => ({ name: faker.company.name() })))
    .returning({ id: organizations.id });
  console.log(`     ✅ ${createdOrgs.length}\n`);

  // ── 4. Users (20 per org, roles: 1 admin / 4 members / 15 viewers) ───────────
  const totalUsers = CFG.ORGS * CFG.USERS_PER_ORG;
  console.log(`👤  Creating ${totalUsers} users...`);

  /** orgId → [userId, ...] */
  const usersByOrg = new Map<string, string[]>();

  for (const org of createdOrgs) {
    const inserted = await db
      .insert(users)
      .values(
        Array.from({ length: CFG.USERS_PER_ORG }, (_, i) => ({
          orgId:        org.id,
          // Unique email: prefix with org shard to avoid collisions
          email:        faker.internet.email().replace('@', `+${org.id.slice(0, 6)}@`),
          passwordHash,
          role: (i === 0 ? 'admin' : i < 5 ? 'member' : 'viewer') as
            'admin' | 'member' | 'viewer',
        })),
      )
      .returning({ id: users.id });
    usersByOrg.set(org.id, inserted.map((u) => u.id));
  }
  console.log(`     ✅ ${totalUsers}\n`);

  // ── 5. Projects (10 per org) ──────────────────────────────────────────────────
  const totalProjects = CFG.ORGS * CFG.PROJECTS_PER_ORG;
  console.log(`📁  Creating ${totalProjects} projects...`);

  /** orgId → [projectId, ...] */
  const projectsByOrg = new Map<string, string[]>();

  for (const org of createdOrgs) {
    const inserted = await db
      .insert(projects)
      .values(
        Array.from({ length: CFG.PROJECTS_PER_ORG }, () => ({
          orgId:       org.id,
          name:        faker.commerce.productName(),
          description: faker.lorem.sentence(),
        })),
      )
      .returning({ id: projects.id });
    projectsByOrg.set(org.id, inserted.map((p) => p.id));
  }
  console.log(`     ✅ ${totalProjects}\n`);

  // ── 6. Tasks in batches ───────────────────────────────────────────────────────
  const totalTasks = totalProjects * CFG.TASKS_PER_PROJECT;
  console.log(`📋  Creating ${totalTasks.toLocaleString()} tasks (batch=${CFG.TASK_BATCH})...`);

  /**
   * Track task IDs grouped by orgId so we can assign org-correct
   * authorIds when creating comments and activity logs later.
   */
  const taskIdsByOrg = new Map<string, string[]>();
  for (const org of createdOrgs) taskIdsByOrg.set(org.id, []);

  // Buffer: build in memory, flush to DB every TASK_BATCH rows
  let taskBuf: {
    projectId:   string;
    assigneeId:  string;
    title:       string;
    description: string;
    status:      typeof STATUSES[number];
    priority:    typeof PRIORITIES[number];
    dueDate?:    Date;
  }[] = [];
  let taskOrgBuf: string[] = []; // parallel array — which org does each buffered task belong to
  let tasksInserted = 0;

  const flushTasks = async () => {
    if (!taskBuf.length) return;
    const rows = await db.insert(tasks).values(taskBuf).returning({ id: tasks.id });
    rows.forEach((r, i) => taskIdsByOrg.get(taskOrgBuf[i]!)!.push(r.id));
    tasksInserted += rows.length;
    progress('tasks', tasksInserted, totalTasks);
    taskBuf = [];
    taskOrgBuf = [];
  };

  for (const org of createdOrgs) {
    const orgUsers    = usersByOrg.get(org.id)!;
    const orgProjects = projectsByOrg.get(org.id)!;

    for (const projectId of orgProjects) {
      for (let i = 0; i < CFG.TASKS_PER_PROJECT; i++) {
        taskBuf.push({
          projectId,
          assigneeId:  pick(orgUsers),
          title:       faker.hacker.phrase(),
          description: faker.lorem.paragraph(),
          status:      pick(STATUSES),
          priority:    pick(PRIORITIES),
          // 70% of tasks have a due date
          dueDate: Math.random() < 0.7 ? faker.date.future() : undefined,
        });
        taskOrgBuf.push(org.id);
        if (taskBuf.length >= CFG.TASK_BATCH) await flushTasks();
      }
    }
  }
  await flushTasks();

  // Bulk-update searchVector in ONE SQL statement — far faster than per-row inserts
  process.stdout.write('\n   Populating search vectors (single UPDATE)...');
  await db.execute(sql`
    UPDATE tasks
    SET search_vector = to_tsvector('english', title || ' ' || coalesce(description, ''))
    WHERE search_vector IS NULL
  `);
  console.log(' done');
  console.log(`     ✅ ${tasksInserted.toLocaleString()}\n`);

  // ── 7. Comments in batches ────────────────────────────────────────────────────
  const totalComments = tasksInserted * CFG.COMMENTS_PER_TASK;
  console.log(`💬  Creating ${totalComments.toLocaleString()} comments (batch=${CFG.COMMENT_BATCH})...`);

  let commentBuf: { taskId: string; authorId: string; body: string }[] = [];
  let commentsInserted = 0;

  const flushComments = async () => {
    if (!commentBuf.length) return;
    await db.insert(comments).values(commentBuf);
    commentsInserted += commentBuf.length;
    progress('comments', commentsInserted, totalComments);
    commentBuf = [];
  };

  for (const org of createdOrgs) {
    const orgUsers   = usersByOrg.get(org.id)!;
    const orgTaskIds = taskIdsByOrg.get(org.id)!;

    for (const taskId of orgTaskIds) {
      for (let i = 0; i < CFG.COMMENTS_PER_TASK; i++) {
        commentBuf.push({
          taskId,
          authorId: pick(orgUsers),
          body:     faker.lorem.sentences({ min: 1, max: 4 }),
        });
        if (commentBuf.length >= CFG.COMMENT_BATCH) await flushComments();
      }
    }
  }
  await flushComments();
  console.log(`\n     ✅ ${commentsInserted.toLocaleString()}\n`);

  // ── 8. Activity logs in batches ───────────────────────────────────────────────
  const totalActivity = tasksInserted * CFG.ACTIVITY_PER_TASK;
  console.log(`📜  Creating ${totalActivity.toLocaleString()} activity log entries (batch=${CFG.ACTIVITY_BATCH})...`);

  let activityBuf: {
    taskId:   string;
    userId:   string;
    action:   string;
    metadata: object;
  }[] = [];
  let activityInserted = 0;

  const flushActivity = async () => {
    if (!activityBuf.length) return;
    await db.insert(activityLog).values(activityBuf);
    activityInserted += activityBuf.length;
    progress('activity', activityInserted, totalActivity);
    activityBuf = [];
  };

  for (const org of createdOrgs) {
    const orgUsers   = usersByOrg.get(org.id)!;
    const orgTaskIds = taskIdsByOrg.get(org.id)!;

    for (const taskId of orgTaskIds) {
      for (let i = 0; i < CFG.ACTIVITY_PER_TASK; i++) {
        activityBuf.push({
          taskId,
          userId:   pick(orgUsers),
          action:   pick(ACTIONS),
          metadata: {},
        });
        if (activityBuf.length >= CFG.ACTIVITY_BATCH) await flushActivity();
      }
    }
  }
  await flushActivity();
  console.log(`\n     ✅ ${activityInserted.toLocaleString()}\n`);

  // ── Summary ───────────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const totalRows =
    createdOrgs.length + totalUsers + totalProjects +
    tasksInserted + commentsInserted + activityInserted;

  console.log('═══════════════════════════════════════');
  console.log(`🎉  Seed complete in ${elapsed}s`);
  console.log(`    Total rows: ${totalRows.toLocaleString()}`);
  console.log('───────────────────────────────────────');
  console.log(`    Organizations : ${createdOrgs.length}`);
  console.log(`    Users         : ${totalUsers}`);
  console.log(`    Projects      : ${totalProjects}`);
  console.log(`    Tasks         : ${tasksInserted.toLocaleString()}`);
  console.log(`    Comments      : ${commentsInserted.toLocaleString()}`);
  console.log(`    Activity Logs : ${activityInserted.toLocaleString()}`);
  console.log('═══════════════════════════════════════');

  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌  Seed failed:', err);
  process.exit(1);
});
