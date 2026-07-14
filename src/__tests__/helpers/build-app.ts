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
import { AppError } from '../../utils/errors.js';
import { swaggerConfig } from '../../config/swagger.js';
import { authMiddleware } from '../../middleware/auth.js';
import { authRoutes } from '../../routes/public/auth.routes.js';
import { projectRoutes } from '../../routes/private/project.routes.js';
import { taskRoutes } from '../../routes/private/task.routes.js';
import { commentRoutes } from '../../routes/private/comment.routes.js';

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

  await app.register(swaggerConfig);
  await app.register(authMiddleware);
  
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(async (privateInstance) => {
    privateInstance.addHook('preHandler', privateInstance.authenticate);
    privateInstance.register(projectRoutes, { prefix: '/projects' });
    privateInstance.register(taskRoutes,    { prefix: '/tasks' });
    privateInstance.register(commentRoutes, { prefix: '/comments' });
  });

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  await app.ready();
  return app;
}
