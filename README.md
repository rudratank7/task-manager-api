# Task Manager API

A production-ready REST API built with **Node.js · TypeScript · Fastify · PostgreSQL · Drizzle ORM · Zod · JWT**.

---

## Table of Contents
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Database Migrations](#database-migrations)
- [Seeding (200k+ rows)](#seeding)
- [API Endpoints](#api-endpoints)
- [Authentication Flow](#authentication-flow)
- [Transactions](#transactions)
- [Concurrency](#optimistic-concurrency)
- [Performance](#performance--explain-analyze)
- [Testing](#testing)
- [Project Structure](#project-structure)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ |
| Language | TypeScript (strict, NodeNext) |
| HTTP Framework | Fastify v5 |
| Database | PostgreSQL 15+ |
| ORM | Drizzle ORM |
| Validation | Zod |
| Auth | JWT (`@fastify/jwt`) + bcrypt |
| Testing | Vitest |
| Docs | Swagger UI (`@fastify/swagger-ui`) |
| Seed | Faker.js |

---

## Architecture

```
src/
├── config/
│   └── env.ts              # Zod-validated env vars (fails fast on startup if invalid)
├── db/
│   ├── index.ts            # Drizzle + postgres.js client
│   └── schema/             # Full schema: orgs → users → projects → tasks → comments → logs
├── lib/
│   ├── errors.ts           # AppError (code + statusCode — global handler catches these)
│   └── validate.ts         # validate() + requireAdmin() helpers for routes
├── modules/
│   ├── auth/               # register, login, refresh token rotation
│   ├── projects/           # CRUD + task-count aggregation + optimistic concurrency
│   ├── tasks/              # CRUD + 7 filters + full-text search + bulk update
│   └── comments/           # CRUD + author-or-admin delete
├── plugins/
│   ├── jwt.ts              # @fastify/jwt + fastify.authenticate decorator
│   └── swagger.ts          # OpenAPI 3.0 + Swagger UI at /docs
├── scripts/
│   └── seed.ts             # 200k+ row seeder with batched inserts
├── types/
│   └── fastify.d.ts        # TypeScript augmentation for request.user
└── server.ts               # App entry point: plugins → routes → listen
```

Each module follows a **Schema → Service → Route** pattern:
- **Schema** (`*.schema.ts`) — Zod definitions, exported as TypeScript types
- **Service** (`*.service.ts`) — Pure business logic, throws `AppError` on failure
- **Route** (`*.routes.ts`) — HTTP only: validate input → call service → return result

---

## Prerequisites

- **Node.js** 20+
- **PostgreSQL** 15+ (local install or Docker)
- **npm** 9+

---

## Quick Start

```bash
# 1. Clone and install
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env and set DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET

# 3. Generate + apply migrations
npm run db:generate
npm run db:migrate

# 4. (Optional) Seed the database with 200k+ rows
npm run db:seed

# 5. Start the dev server
npm run dev
```

The server starts at **http://localhost:3000**
Swagger UI is at **http://localhost:3000/docs**

---

## Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string | `postgresql://postgres:pw@localhost:5432/task_manager` |
| `JWT_SECRET` | ✅ | Secret for signing access tokens (min 32 chars) | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | ✅ | Secret for signing refresh tokens | `openssl rand -hex 32` |
| `JWT_EXPIRES_IN` | ❌ | Access token TTL (default `15m`) | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | ❌ | Refresh token TTL (default `7d`) | `7d` |
| `PORT` | ❌ | Server port (default `3000`) | `3000` |
| `NODE_ENV` | ❌ | Environment (default `development`) | `production` |

> **Tip:** All env vars are validated at startup via Zod in `src/config/env.ts`. The server refuses to start if any required var is missing — no silent failures.

---

## Database Migrations

Migrations are managed by **Drizzle Kit** — never edit the DB manually.

```bash
# Step 1 — Generate SQL migration files from schema changes
npm run db:generate
# Output: drizzle/0001_xxxxx.sql

# Step 2 — Apply pending migrations to the database
npm run db:migrate

# Optional — Visual DB browser (Drizzle Studio)
npm run db:studio
```

### Schema Overview

```
organizations
└── users (role: admin | member | viewer)
    └── refresh_tokens

projects (orgId FK)
└── tasks (projectId FK, assigneeId FK)
    ├── searchVector (tsvector, GIN index — full-text search)
    ├── version (int — optimistic concurrency)
    ├── deletedAt (soft delete)
    └── comments
        └── activityLog
```

### Indexes Created

| Table | Column(s) | Type | Purpose |
|-------|-----------|------|---------|
| `users` | `org_id` | B-tree | Filter users by org |
| `users` | `email` | B-tree unique | Fast login lookup |
| `tasks` | `project_id` | B-tree | Filter tasks by project |
| `tasks` | `assignee_id` | B-tree | Filter tasks by assignee |
| `tasks` | `status` | B-tree | Filter tasks by status |
| `tasks` | `priority` | B-tree | Filter tasks by priority |
| `tasks` | `due_date` | B-tree | Date range queries |
| `tasks` | `search_vector` | **GIN** | Full-text search |
| `comments` | `task_id` | B-tree | Get comments for a task |
| `activity_log` | `task_id` | B-tree | Get activity for a task |
| `refresh_tokens` | `token` | B-tree unique | Token lookup on refresh |

---

## Seeding

```bash
npm run db:seed
```

Creates **200,155+ rows** in batches (never loads all data into memory):

| Table | Rows |
|-------|------|
| Organizations | 5 |
| Users | 100 (1 admin + 4 members + 15 viewers per org) |
| Projects | 50 |
| **Tasks** | **12,500** |
| **Comments** | **125,000** |
| **Activity Logs** | **62,500** |
| **Total** | **~200,155** |

All users have password: **`password123`**

The seeder uses a **single bulk `UPDATE`** to populate `search_vector` for all tasks after insertion — faster than setting it per-row.

---

## API Endpoints

### Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | — | Create org + admin user → returns tokens |
| POST | `/auth/login` | — | Login → returns tokens |
| POST | `/auth/refresh` | — | Rotate refresh token → new token pair |

#### Register body
```json
{ "orgName": "Acme Corp", "email": "admin@acme.com", "password": "secret123" }
```

#### Login body
```json
{ "email": "admin@acme.com", "password": "secret123" }
```

#### Refresh body
```json
{ "refreshToken": "<refresh_token_from_login>" }
```

---

### Projects

All endpoints require `Authorization: Bearer <accessToken>`

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/projects` | any | List projects (paginated) |
| GET | `/projects/:id` | any | Get project + task counts by status |
| POST | `/projects` | admin | Create project |
| PATCH | `/projects/:id` | admin | Update project (send `version`) |
| DELETE | `/projects/:id` | admin | Soft-delete project |

#### GET /projects query params
```
?page=1&limit=20
```

#### POST /projects body
```json
{ "name": "API v2", "description": "Rebuild the API" }
```

#### PATCH /projects/:id body
```json
{ "name": "API v3", "version": 1 }
```
> `version` is required for optimistic concurrency — returns 409 if stale.

---

### Tasks

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/tasks` | any | List with filters + search + sort + pagination |
| GET | `/tasks/:id` | any | Task + 10 recent comments + 10 activity entries |
| POST | `/tasks` | any | Create task (atomic: task + activity log) |
| PATCH | `/tasks/:id` | any | Update task (atomic: update + change log) |
| DELETE | `/tasks/:id` | any | Soft-delete task (atomic: delete + activity log) |
| PATCH | `/tasks/bulk` | any | Bulk update status/assignee (all-or-nothing) |

#### GET /tasks — all query params
```
?projectId=uuid         Filter by project
&status=todo            Filter by status: todo | in_progress | done | archived
&priority=high          Filter by priority: low | medium | high | urgent
&assigneeId=uuid        Filter by assignee
&dueDateFrom=2024-01-01 Due date range start (ISO date)
&dueDateTo=2024-12-31   Due date range end   (ISO date)
&search=fix+login       Full-text search across title + description
&sortBy=createdAt       Sort field: createdAt | dueDate | priority | status
&order=desc             Sort order: asc | desc
&page=1                 Page number
&limit=20               Items per page (max 100)
```

#### PATCH /tasks/bulk body
```json
{
  "ids": ["uuid1", "uuid2", "uuid3"],
  "status": "done",
  "assigneeId": "uuid-or-null"
}
```
> All-or-nothing: if any ID is invalid, **zero** tasks are updated (full rollback).

---

### Comments

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/comments?taskId=uuid` | any | Paginated comments for a task |
| POST | `/comments` | any | Add comment (atomic: comment + activity log) |
| DELETE | `/comments/:id` | author or admin | Soft-delete comment |

#### POST /comments body
```json
{ "taskId": "uuid", "body": "Looking good, ship it!" }
```

---

## Authentication Flow

```
1. POST /auth/register  →  { accessToken, refreshToken }
2.                              │
3. Add header to all requests: Authorization: Bearer <accessToken>
4.                              │
5. Access token expires (15 min)
6. POST /auth/refresh   →  { accessToken, refreshToken (new) }
7.                              │
8. Old refresh token is REVOKED in the same DB transaction (rotation)
9. If stolen token is reused → 401 Unauthorized
```

**Token storage:** Never store tokens in `localStorage` — use `httpOnly` cookies in production.

---

## Transactions

Every write that touches multiple tables is wrapped in `db.transaction(async (tx) => { ... })`. If anything throws inside the callback, Drizzle issues `ROLLBACK` — nothing is persisted.

| Operation | Atomic units |
|-----------|-------------|
| `POST /auth/register` | org INSERT + user INSERT |
| `POST /auth/refresh` | old token revoke + new token INSERT |
| `POST /tasks` | task INSERT + activityLog INSERT |
| `PATCH /tasks/:id` | task UPDATE + activityLog INSERT (change diff) |
| `DELETE /tasks/:id` | task soft-delete + activityLog INSERT |
| `PATCH /tasks/bulk` | N-task UPDATE + N activityLog INSERTs |
| `POST /comments` | comment INSERT + activityLog INSERT |

---

## Optimistic Concurrency

`projects` and `tasks` have a `version` integer column. On every update:

1. Client reads the resource (receives current `version`)
2. Client sends `PATCH` with the changes **+ `version`**
3. Server compares client version with DB version
4. **Match** → update proceeds, `version` is incremented
5. **Mismatch** → `409 Conflict` — someone else updated first, client must refresh

This prevents the "lost update" problem without row-level locking.

---

## Performance — EXPLAIN ANALYZE

Run these in **psql** or **DBeaver** after seeding to verify index usage:

```sql
-- Full-text search (should use GIN index: tasks_search_vector_idx)
EXPLAIN ANALYZE
SELECT * FROM tasks
WHERE search_vector @@ plainto_tsquery('english', 'fix login bug')
  AND deleted_at IS NULL
LIMIT 20;

-- Status + priority filter (B-tree indexes on both columns)
EXPLAIN ANALYZE
SELECT * FROM tasks
WHERE status = 'todo'
  AND priority = 'high'
  AND deleted_at IS NULL
ORDER BY due_date ASC
LIMIT 20;

-- Assignee filter
EXPLAIN ANALYZE
SELECT * FROM tasks
WHERE assignee_id = '<uuid>'
  AND deleted_at IS NULL
LIMIT 20;

-- Task counts by status (GROUP BY — check sequential scan is acceptable on small project tables)
EXPLAIN ANALYZE
SELECT status, count(*)
FROM tasks
WHERE project_id = '<uuid>'
  AND deleted_at IS NULL
GROUP BY status;
```

> With 12,500 tasks and proper indexes, all of the above should complete in **< 10ms** (well under the 100ms requirement).

---

## Testing

```bash
# Run all tests (schema unit tests + integration tests)
npm test

# Watch mode (re-runs on file change)
npm run test:watch
```

### Test structure

| File | Type | DB needed? |
|------|------|-----------|
| `src/__tests__/schemas.test.ts` | Unit (Zod schemas) | ❌ No |
| `src/__tests__/integration/auth.test.ts` | Integration (inject) | ❌ No (validation tests) |

Tests that fail at Zod validation never reach the service/DB layer — they work without a running database.

### Adding DB integration tests

```typescript
// Use a TEST_DATABASE_URL in .env for isolated test runs
// Example test that requires DB:
it('creates a user and returns 201', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { orgName: 'Test Org', email: 'test@test.com', password: 'password123' },
  });
  expect(res.statusCode).toBe(201);
  expect(JSON.parse(res.payload)).toHaveProperty('accessToken');
});
```

---

## Project Structure

```
task-manager-api/
├── drizzle/                 # Generated SQL migration files (commit these!)
├── src/
│   ├── __tests__/           # Unit + integration tests
│   │   ├── helpers/         # buildTestApp() helper
│   │   ├── integration/     # HTTP-level tests via fastify.inject()
│   │   └── schemas.test.ts  # Zod schema unit tests
│   ├── config/
│   │   └── env.ts           # Env var validation (fails fast)
│   ├── db/
│   │   ├── index.ts         # DB client
│   │   └── schema/          # Drizzle table + index definitions
│   ├── lib/
│   │   ├── errors.ts        # AppError class
│   │   └── validate.ts      # validate() + requireAdmin() helpers
│   ├── modules/
│   │   ├── auth/            # auth.schema.ts + auth.service.ts + auth.routes.ts
│   │   ├── comments/        # comments.*
│   │   ├── projects/        # projects.*
│   │   └── tasks/           # tasks.*
│   ├── plugins/
│   │   ├── jwt.ts           # JWT auth plugin
│   │   └── swagger.ts       # OpenAPI docs plugin
│   ├── scripts/
│   │   └── seed.ts          # Database seeder (200k+ rows)
│   ├── types/
│   │   └── fastify.d.ts     # request.user type augmentation
│   └── server.ts            # Entry point
├── .env                     # Local env (NOT committed)
├── .env.example             # Template (committed)
├── drizzle.config.ts        # Drizzle Kit config
├── package.json
├── tsconfig.json
└── vitest.config.ts
```
