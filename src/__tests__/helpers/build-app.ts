/**
 * TEST HELPER — Build App  (src/__tests__/helpers/build-app.ts)
 *
 * Creates a fully configured Fastify instance identical to production but
 * with `logger: false` (keeps test output clean). Used by all integration tests.
 *
 * WHY NO DB MOCK?
 * Tests that fail at Zod validation never reach the service layer / DB,
 * so they work fine without a running database. Tests that DO need the DB
 * are marked as integration tests and documented to require DATABASE_URL.
 *
 * HOW TO USE:
 *   const app = await buildTestApp();
 *   const res = await app.inject({ method: 'POST', url: '/auth/register', payload: {...} });
 *   await app.close();
 */
import Fastify from 'fastify';
import { AppError } from '../../lib/errors.js';
import { swaggerPlugin } from '../../plugins/swagger.js';
import { jwtPlugin } from '../../plugins/jwt.js';
import { authRoutes } from '../../modules/auth/auth.routes.js';
import { projectsRoutes } from '../../modules/projects/projects.routes.js';
import { tasksRoutes } from '../../modules/tasks/tasks.routes.js';
import { commentsRoutes } from '../../modules/comments/comments.routes.js';

export async function buildTestApp() {
  const app = Fastify({ logger: false });

  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message },
      });
    }
    const httpErr = err as { statusCode?: number; message: string };
    return reply.status(httpErr.statusCode ?? 500).send({
      error: { code: 'ERROR', message: httpErr.message },
    });
  });

  await app.register(swaggerPlugin);
  await app.register(jwtPlugin);
  await app.register(authRoutes,     { prefix: '/auth' });
  await app.register(projectsRoutes, { prefix: '/projects' });
  await app.register(tasksRoutes,    { prefix: '/tasks' });
  await app.register(commentsRoutes, { prefix: '/comments' });

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  await app.ready();
  return app;
}
